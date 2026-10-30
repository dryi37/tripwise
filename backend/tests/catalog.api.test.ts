import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestApp } from "./test-app.js";
import { CatalogService } from "../src/modules/catalog/catalog.service.js";
import type { CatalogRepository, ServiceRecord, SupplierOfferRecord } from "../src/modules/catalog/catalog.types.js";
import { InMemoryPlanningRepository } from "../src/modules/planning/infrastructure/in-memory-planning.repository.js";
import { PlanningService } from "../src/modules/planning/planning.service.js";
import { InMemoryTripRepository } from "../src/modules/trips/infrastructure/in-memory-trip.repository.js";
import { TripService } from "../src/modules/trips/trip.service.js";

class MemoryCatalogRepository implements CatalogRepository {
  services: ServiceRecord[] = [];
  offers: SupplierOfferRecord[] = [];
  async list(input: { q?: string; category?: string; status?: string; activeOnly: boolean; skip: number; take: number }) {
    const rows = this.services.filter((service) =>
      (!input.activeOnly || service.isActive) &&
      (!input.q || `${service.name} ${service.offer?.status !== "INACTIVE" ? service.offer?.details ?? "" : ""}`.toLowerCase().includes(input.q.toLowerCase())) &&
      (!input.category || service.category === input.category) &&
      (!input.status || (service.offer?.status === input.status && service.offer.status !== "INACTIVE")),
    ).map((service) => ({ ...service, offer: service.offer?.status === "INACTIVE" ? null : service.offer }));
    return { rows: rows.slice(input.skip, input.skip + input.take), total: rows.length };
  }
  async findServiceById(id: string) { return this.services.find((row) => row.id === id) ?? null; }
  async createService(service: ServiceRecord) { this.services.push(service); return service; }
  async updateService(id: string, changes: Partial<ServiceRecord>, updatedAt: Date) {
    const row = await this.findServiceById(id); if (!row) return null; Object.assign(row, changes, { updatedAt }); return row;
  }
  async findOfferById(id: string) { return this.offers.find((row) => row.id === id) ?? null; }
  async createOffer(offer: SupplierOfferRecord) {
    this.offers.push(offer); const service = await this.findServiceById(offer.serviceId); if (service) service.offer = offer; return offer;
  }
  async updateOffer(id: string, changes: Partial<SupplierOfferRecord>, updatedAt: Date) {
    const row = await this.findOfferById(id); if (!row) return null; Object.assign(row, changes, { updatedAt }); return row;
  }
  async getOfferSearchRecords(filter: { offerIds?: string[]; serviceId?: string } = {}) {
    return this.offers.filter((offer) => (!filter.offerIds || filter.offerIds.includes(offer.id)) && (!filter.serviceId || offer.serviceId === filter.serviceId)).flatMap((offer) => {
      const service = this.services.find((row) => row.id === offer.serviceId);
      return service ? [{ service: { id: service.id, name: service.name, category: service.category, tags: service.tags ?? [], unit: service.unit, isActive: service.isActive }, offer }] : [];
    });
  }
}

function testApp(repository = new MemoryCatalogRepository()) {
  const trips = new InMemoryTripRepository();
  let id = 0;
  const catalogService = new CatalogService(repository, {
    createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    now: () => new Date("2026-10-27T08:00:00.000Z"),
    searchResultsPerTool: 5,
  });
  return createTestApp({
    tripService: new TripService(trips),
    planningService: new PlanningService(trips, new InMemoryPlanningRepository(), undefined, undefined, undefined, "Asia/Ho_Chi_Minh"),
    catalogService,
  });
}

describe("catalog API", () => {
  it("uses semantic offer matches before falling back to keyword catalog search", async () => {
    const repository = new MemoryCatalogRepository();
    const service: ServiceRecord = { id: "service-semantic", name: "Xe riêng có tài xế", category: "Di chuyển", unit: "xe/ngày", isActive: true, createdAt: new Date(), updatedAt: new Date(), offer: null };
    const offer: SupplierOfferRecord = { id: "offer-semantic", serviceId: service.id, unitPriceMinor: 3_000_000, currency: "VND", validFrom: null, validUntil: null, details: "Xe 7 chỗ phù hợp gia đình", status: "VERIFIED", createdAt: new Date(), updatedAt: new Date() };
    service.offer = offer; repository.services.push(service); repository.offers.push(offer);
    const searchIndex = { indexOffer: async () => {}, search: async () => [offer.id], reindex: async () => {} };
    const result = await new CatalogService(repository, { searchResultsPerTool: 5 }, searchIndex).searchForAgent({ query: "xe cho gia đình" });
    expect(result.flatMap((item) => item.offers.map((itemOffer) => itemOffer.id))).toEqual([offer.id]);
  });

  it("returns only verified offers from semantic search", async () => {
    const repository = new MemoryCatalogRepository();
    const service: ServiceRecord = { id: "service-live", name: "Xe tham quan", category: "Di chuyển", unit: "xe/ngày", isActive: true, createdAt: new Date(), updatedAt: new Date(), offer: null };
    const unverifiedService: ServiceRecord = { ...service, id: "service-unverified", offer: null };
    const verified: SupplierOfferRecord = { id: "offer-live", serviceId: service.id, unitPriceMinor: 3_000_000, currency: "VND", validFrom: null, validUntil: null, details: "Xe gia đình", status: "VERIFIED", createdAt: new Date(), updatedAt: new Date() };
    const unverified: SupplierOfferRecord = { ...verified, id: "offer-unverified", status: "UNVERIFIED" };
    unverified.serviceId = unverifiedService.id; service.offer = verified; unverifiedService.offer = unverified; repository.services.push(service, unverifiedService); repository.offers.push(verified, unverified);
    const searchIndex = { indexOffer: async () => {}, search: async () => [unverified.id, verified.id], reindex: async () => {} };
    const result = await new CatalogService(repository, { searchResultsPerTool: 5 }, searchIndex).searchForAgent({ query: "xe cho gia đình" });
    expect(result.flatMap((item) => item.offers.map((itemOffer) => itemOffer.id))).toEqual([verified.id]);
  });

  it("returns only verified offers from fallback search", async () => {
    const repository = new MemoryCatalogRepository();
    const service: ServiceRecord = { id: "service-live", name: "Xe tham quan", category: "Di chuyển", unit: "xe/ngày", isActive: true, createdAt: new Date(), updatedAt: new Date(), offer: null };
    const unverifiedService: ServiceRecord = { ...service, id: "service-unverified", offer: null };
    const verified: SupplierOfferRecord = { id: "offer-live", serviceId: service.id, unitPriceMinor: 3_000_000, currency: "VND", validFrom: null, validUntil: null, details: "Xe gia đình", status: "VERIFIED", createdAt: new Date(), updatedAt: new Date() };
    const unverified: SupplierOfferRecord = { ...verified, id: "offer-unverified", status: "UNVERIFIED" };
    unverified.serviceId = unverifiedService.id; service.offer = verified; unverifiedService.offer = unverified; repository.services.push(service, unverifiedService); repository.offers.push(verified, unverified);

    const result = await new CatalogService(repository, { searchResultsPerTool: 5 }).searchForAgent({ query: "xe gia đình" });

    expect(result.flatMap((item) => item.offers.map((itemOffer) => itemOffer.id))).toEqual([verified.id]);
  });

  it("rejects adding a second price to a service", async () => {
    const repository = new MemoryCatalogRepository();
    const service: ServiceRecord = { id: "service-single-price", name: "Xe tham quan", category: "Di chuyển", unit: "xe/ngày", isActive: true, createdAt: new Date(), updatedAt: new Date(), offer: null };
    const existing: SupplierOfferRecord = { id: "offer-existing", serviceId: service.id, unitPriceMinor: 3_000_000, currency: "VND", validFrom: null, validUntil: null, details: null, status: "VERIFIED", createdAt: new Date(), updatedAt: new Date() };
    service.offer = existing; repository.services.push(service); repository.offers.push(existing);

    await expect(new CatalogService(repository).addOffer(service.id, { unitPriceMinor: 4_000_000, currency: "VND", status: "UNVERIFIED" }))
      .rejects.toMatchObject({ status: 409, code: "SERVICE_PRICE_EXISTS" });
  });

  it("returns a clear conflict from the catalog API when a service already has a price", async () => {
    const repository = new MemoryCatalogRepository();
    const service: ServiceRecord = { id: "00000000-0000-4000-8000-000000000501", name: "Xe tham quan", category: "Di chuyển", unit: "xe/ngày", isActive: true, createdAt: new Date(), updatedAt: new Date(), offer: null };
    const offer: SupplierOfferRecord = { id: "00000000-0000-4000-8000-000000000502", serviceId: service.id, unitPriceMinor: 3_000_000, currency: "VND", validFrom: null, validUntil: null, details: null, status: "VERIFIED", createdAt: new Date(), updatedAt: new Date() };
    service.offer = offer; repository.services.push(service); repository.offers.push(offer);

    const response = await request(testApp(repository)).post(`/api/v1/catalog/services/${service.id}/offers`).send({ unitPriceMinor: 4_000_000, currency: "VND", status: "UNVERIFIED" });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({ code: "SERVICE_PRICE_EXISTS" });
  });

  it("updates the existing price instead of creating a second price", async () => {
    const repository = new MemoryCatalogRepository();
    const service: ServiceRecord = { id: "service-update", name: "Xe tham quan", category: "Di chuyển", unit: "xe/ngày", isActive: true, createdAt: new Date(), updatedAt: new Date(), offer: null };
    const existing: SupplierOfferRecord = { id: "offer-update", serviceId: service.id, unitPriceMinor: 3_000_000, currency: "VND", validFrom: null, validUntil: null, details: null, status: "VERIFIED", createdAt: new Date(), updatedAt: new Date() };
    service.offer = existing; repository.services.push(service); repository.offers.push(existing);

    const updated = await new CatalogService(repository).updateOffer(service.id, existing.id, { unitPriceMinor: 4_000_000 });

    expect(updated.unitPriceMinor).toBe(4_000_000);
    expect(repository.offers).toHaveLength(1);
  });

  it("maps a database unique conflict to SERVICE_PRICE_EXISTS", async () => {
    const repository = new MemoryCatalogRepository();
    const service: ServiceRecord = { id: "service-race", name: "Xe tham quan", category: "Di chuyển", unit: "xe/ngày", isActive: true, createdAt: new Date(), updatedAt: new Date(), offer: null };
    repository.services.push(service);
    repository.createOffer = async () => { throw Object.assign(new Error("unique constraint"), { code: "P2002" }); };

    await expect(new CatalogService(repository).addOffer(service.id, { unitPriceMinor: 4_000_000, currency: "VND", status: "UNVERIFIED" }))
      .rejects.toMatchObject({ status: 409, code: "SERVICE_PRICE_EXISTS" });
  });

  it("uses the configured limit for internal catalog searches", async () => {
    const repository = new MemoryCatalogRepository();
    for (let index = 0; index < 8; index += 1) {
      const service: ServiceRecord = { id: `service-${index}`, name: `Seoul service ${index}`, category: "Di chuyển", unit: "người", isActive: true, createdAt: new Date(), updatedAt: new Date(), offer: null };
      const offer: SupplierOfferRecord = { id: `offer-${index}`, serviceId: service.id, unitPriceMinor: 1000 + index, currency: "VND", validFrom: null, validUntil: null, details: "Seoul", status: "VERIFIED", createdAt: new Date(), updatedAt: new Date() };
      service.offer = offer; repository.services.push(service); repository.offers.push(offer);
    }

    const results = await new CatalogService(repository, { searchResultsPerTool: 3 }).searchForAgent({ query: "Seoul" });

    expect(results).toHaveLength(3);
    expect(results.every((service) => service.offers.length === 1)).toBe(true);
  });

  it("keeps the catalog API offers array while internal service records stay singular", async () => {
    const repository = new MemoryCatalogRepository();
    const service: ServiceRecord = { id: "service-list", name: "Vé cung điện", category: "Tham quan", unit: "vé", isActive: true, createdAt: new Date(), updatedAt: new Date(), offer: null };
    const offer: SupplierOfferRecord = { id: "offer-list", serviceId: service.id, unitPriceMinor: 35_000, currency: "VND", validFrom: null, validUntil: null, details: null, status: "VERIFIED", createdAt: new Date(), updatedAt: new Date() };
    service.offer = offer; repository.services.push(service);

    const result = await new CatalogService(repository).list({ page: 1, pageSize: 20 });

    expect(result.data[0]?.offers).toEqual([offer]);
  });

  it("matches an additional service-type tag when filtering internal offers by category", async () => {
    const repository = new MemoryCatalogRepository();
    const service: ServiceRecord = { id: "service-hotel", name: "Khách sạn gia đình Seoul", category: "Tham quan", tags: ["SIGHTSEEING", "LODGING"], unit: "phòng/đêm", isActive: true, createdAt: new Date(), updatedAt: new Date(), offer: null };
    const offer: SupplierOfferRecord = { id: "offer-hotel", serviceId: service.id, unitPriceMinor: 1_950_000, currency: "VND", validFrom: null, validUntil: null, details: "Khách sạn tại Seoul", status: "VERIFIED", createdAt: new Date(), updatedAt: new Date() };
    service.offer = offer; repository.services.push(service); repository.offers.push(offer);

    const result = await new CatalogService(repository, { searchResultsPerTool: 5 }).searchForAgent({ query: "Khách sạn gia đình", category: "Lưu trú" });

    expect(result.flatMap((item) => item.offers.map((itemOffer) => itemOffer.id))).toEqual([offer.id]);
  });
});


