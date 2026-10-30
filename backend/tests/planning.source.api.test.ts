import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestApp } from "./test-app.js";
import type { CatalogRepository, ServiceRecord, SupplierOfferRecord } from "../src/modules/catalog/catalog.types.js";
import { CatalogService } from "../src/modules/catalog/catalog.service.js";
import { InMemoryPlanningRepository } from "../src/modules/planning/infrastructure/in-memory-planning.repository.js";
import { PlanningService } from "../src/modules/planning/planning.service.js";
import { InMemoryTripRepository } from "../src/modules/trips/infrastructure/in-memory-trip.repository.js";
import { TripService } from "../src/modules/trips/trip.service.js";

class FixedCatalog implements CatalogRepository {
  service: ServiceRecord;
  offer: SupplierOfferRecord;
  constructor() {
    const now = new Date("2026-10-27T08:00:00.000Z");
    this.offer = { id: "00000000-0000-4000-8000-000000000301", serviceId: "00000000-0000-4000-8000-000000000300", unitPriceMinor: 2_200_000, currency: "VND", validFrom: null, validUntil: "2027-12-31", details: "Không hoàn hủy", status: "VERIFIED", createdAt: now, updatedAt: now };
    this.service = { id: this.offer.serviceId, name: "Phòng khách sạn", category: "Lưu trú", unit: "phòng/đêm", isActive: true, createdAt: now, updatedAt: now, offer: this.offer };
  }
  async list(input?: { activeOnly: boolean }) { const rows = !input?.activeOnly || this.service.isActive ? [this.service] : []; return { rows, total: rows.length }; }
  async findServiceById(id: string) { return id === this.service.id ? this.service : null; }
  async createService(value: ServiceRecord) { return value; }
  async updateService() { return null; }
  async findOfferById(id: string) { return id === this.offer.id ? this.offer : null; }
  async createOffer(value: SupplierOfferRecord) { return value; }
  async updateOffer() { return null; }
  async getOfferSearchRecords() { return [{ service: { id: this.service.id, name: this.service.name, category: this.service.category, unit: this.service.unit, isActive: this.service.isActive }, offer: this.offer }]; }
}

async function setup() {
  let id = 0;
  const dependencies = { createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`, now: () => new Date("2026-10-27T08:00:00.000Z") };
  const trips = new InMemoryTripRepository();
  const tripService = new TripService(trips, dependencies);
  const catalog = new FixedCatalog();
  const catalogService = new CatalogService(catalog, dependencies);
  const planningService = new PlanningService(trips, new InMemoryPlanningRepository(), dependencies, catalogService, undefined, "Asia/Ho_Chi_Minh");
  const trip = await tripService.create({ title: "Seoul", customerName: "Minh", origin: "HCM", destination: "Seoul", startDate: "2027-04-05", endDate: "2027-04-09", travelers: 6, budgetAmountMinor: 120_000_000, budgetCurrency: "VND" });
  return { app: createTestApp({ tripService, planningService, catalogService }), trip, catalog };
}

describe("source-aware quote API", () => {
  it("rejects an inactive supplier offer when adding a new quote line", async () => {
    const { app, trip, catalog } = await setup();
    catalog.service.isActive = false;
    catalog.offer.status = "INACTIVE";

    const response = await request(app)
      .post(`/api/v1/trips/${trip.id}/draft/quote/items/from-offer`)
      .set("Idempotency-Key", "inactive-quote-offer")
      .send({ supplierOfferId: catalog.offer.id, quantity: 1, expectedRevision: 1 });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("OFFER_NOT_AVAILABLE");
  });

  it("adds an offer snapshot and preserves source metadata", async () => {
    const { app, trip } = await setup();
    const response = await request(app)
      .post(`/api/v1/trips/${trip.id}/draft/quote/items/from-offer`)
      .set("Idempotency-Key", "quote-offer-1")
      .send({ supplierOfferId: "00000000-0000-4000-8000-000000000301", quantity: 4, expectedRevision: 1 });

    expect(response.status).toBe(201);
    expect(response.body.data.items[0]).toMatchObject({
      serviceId: "00000000-0000-4000-8000-000000000300",
      supplierOfferId: "00000000-0000-4000-8000-000000000301",
      sourceType: "CATALOG",
      sourceStatus: "VERIFIED",
      priceStatus: "SOURCE",
      serviceNameSnapshot: "Phòng khách sạn",
      termsSnapshot: "Không hoàn hủy",
      unitPriceMinor: 2_200_000,
      amountMinor: 8_800_000,
    });
  });

  it("marks a catalog line as overridden when its price changes", async () => {
    const { app, trip } = await setup();
    const created = await request(app).post(`/api/v1/trips/${trip.id}/draft/quote/items/from-offer`).set("Idempotency-Key", "quote-offer-2").send({ supplierOfferId: "00000000-0000-4000-8000-000000000301", quantity: 1, expectedRevision: 1 });
    const item = created.body.data.items[0];
    const changed = await request(app).patch(`/api/v1/trips/${trip.id}/draft/quote/items/${item.id}`).send({ expectedRevision: 2, unitPriceMinor: 2_000_000 });

    expect(changed.body.data.items[0]).toMatchObject({ supplierOfferId: item.supplierOfferId, priceStatus: "PRICE_OVERRIDDEN", sourceUnitPriceMinor: 2_200_000 });
  });

  it("adds a manual line without a catalog reference", async () => {
    const { app, trip } = await setup();
    const response = await request(app).post(`/api/v1/trips/${trip.id}/draft/quote/items/manual`).set("Idempotency-Key", "quote-manual-1").send({ expectedRevision: 1, name: "Vé sự kiện", category: "Tham quan", unit: "người", quantity: 6, unitPriceMinor: 500_000, terms: "Thanh toán trước", saveToCatalog: false });

    expect(response.status).toBe(201);
    expect(response.body.data.items[0]).toMatchObject({ sourceType: "MANUAL", priceStatus: "MANUAL", supplierOfferId: null });
  });

  it("replays the same idempotent create without duplicating a quote line", async () => {
    const { app, trip } = await setup();
    const url = `/api/v1/trips/${trip.id}/draft/quote/items/from-offer`;
    const body = { supplierOfferId: "00000000-0000-4000-8000-000000000301", quantity: 1, expectedRevision: 1 };
    const first = await request(app).post(url).set("Idempotency-Key", "stable-intent").send(body);
    const replay = await request(app).post(url).set("Idempotency-Key", "stable-intent").send(body);

    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.body.data.items).toHaveLength(1);
  });

  it("rejects reuse of an idempotency key with a different payload", async () => {
    const { app, trip } = await setup();
    const url = `/api/v1/trips/${trip.id}/draft/quote/items/from-offer`;
    await request(app).post(url).set("Idempotency-Key", "wrong-reuse").send({ supplierOfferId: "00000000-0000-4000-8000-000000000301", quantity: 1, expectedRevision: 1 });
    const reused = await request(app).post(url).set("Idempotency-Key", "wrong-reuse").send({ supplierOfferId: "00000000-0000-4000-8000-000000000301", quantity: 2, expectedRevision: 1 });

    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});

