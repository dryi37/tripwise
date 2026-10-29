import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestApp } from "./test-app.js";
import { InMemoryPlanningRepository } from "../src/modules/planning/infrastructure/in-memory-planning.repository.js";
import { PlanningService } from "../src/modules/planning/planning.service.js";
import { InMemoryTripRepository } from "../src/modules/trips/infrastructure/in-memory-trip.repository.js";
import { TripService } from "../src/modules/trips/trip.service.js";

async function setup() {
  let id = 0;
  const dependencies = {
    createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    now: () => new Date("2026-10-27T04:00:00.000Z"),
  };
  const tripRepository = new InMemoryTripRepository();
  const tripService = new TripService(tripRepository, dependencies);
  const planningService = new PlanningService(
    tripRepository,
    new InMemoryPlanningRepository(),
    dependencies,
  );
  const trip = await tripService.create({
    title: "Seoul family trip",
    customerName: "Gia đình anh Minh",
    origin: "Ho Chi Minh City",
    destination: "Seoul",
    startDate: "2027-04-05",
    endDate: "2027-04-09",
    travelers: 6,
    budgetAmountMinor: 120_000_000,
    budgetCurrency: "VND",
  });
  return { app: createTestApp({ tripService, planningService }), trip };
}

describe("planning API", () => {
  it("creates and returns an itinerary item", async () => {
    const { app, trip } = await setup();
    const draft = await request(app).get(`/api/v1/trips/${trip.id}/draft`);
    const response = await request(app)
      .post(`/api/v1/trips/${trip.id}/draft/items`)
      .send({
        expectedRevision: draft.body.data.revision,
        dayIndex: 1,
        title: "Cung điện Gyeongbokgung",
        location: "Seoul",
        localStartTime: "09:00",
        localEndTime: "11:00",
        timezone: "Asia/Seoul",
        description: "Tham quan cung điện",
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ revision: 2 });
    expect(response.body.data.items[0]).toMatchObject({ dayIndex: 1, isLocked: false });
  });

  it("adds an unpriced activity with a linked quote row through the itinerary API", async () => {
    const { app, trip } = await setup();
    const response = await request(app)
      .post(`/api/v1/trips/${trip.id}/draft/items`)
      .send({
        expectedRevision: 1,
        dayIndex: 1,
        title: "Cung điện Gyeongbokgung",
        location: "Seoul",
        localStartTime: "09:00",
        localEndTime: "11:00",
        timezone: "Asia/Seoul",
        description: "Tham quan cung điện",
        quantity: 2,
      });
    const quote = await request(app).get(`/api/v1/trips/${trip.id}/draft/quote`);

    expect(response.status).toBe(201);
    expect(quote.body.data.items).toEqual([
      expect.objectContaining({
        itineraryItemId: response.body.data.items[0].id,
        name: "Cung điện Gyeongbokgung",
        quantity: 2,
        unitPriceMinor: null,
        amountMinor: null,
        priceStatus: "NEEDS_REVIEW",
      }),
    ]);
    expect(quote.body.data.totalAmountMinor).toBe(0);
  });

  it("accepts consultant-entered quantity, unit and price on an activity", async () => {
    const { app, trip } = await setup();
    const response = await request(app).post(`/api/v1/trips/${trip.id}/draft/items`).send({
      expectedRevision: 1, dayIndex: 1, title: "Vé cung điện", location: "Seoul",
      localStartTime: "09:00", localEndTime: "11:00", timezone: "Asia/Seoul",
      description: "", quantity: 3, unit: "vé", unitPriceMinor: 45_000,
    });
    const quote = await request(app).get(`/api/v1/trips/${trip.id}/draft/quote`);

    expect(response.status).toBe(201);
    expect(quote.body.data.items[0]).toMatchObject({
      itineraryItemId: response.body.data.items[0].id, quantity: 3, unit: "vé",
      unitPriceMinor: 45_000, amountMinor: 135_000, sourceType: "MANUAL", priceStatus: "MANUAL",
    });
  });

  it("preserves omitted fields and allows an item to be unlocked", async () => {
    const { app, trip } = await setup();
    await request(app).get(`/api/v1/trips/${trip.id}/draft`);
    const created = await request(app).post(`/api/v1/trips/${trip.id}/draft/items`).send({
      expectedRevision: 1,
      dayIndex: 1,
      title: "Palace",
      location: "Jongno-gu",
      localStartTime: "09:00",
      localEndTime: "11:00",
      timezone: "Asia/Seoul",
      description: "Keep this text",
    });
    const itemId = created.body.data.items[0].id;
    const locked = await request(app).patch(`/api/v1/trips/${trip.id}/draft/items/${itemId}`).send({
      expectedRevision: 2,
      isLocked: true,
    });
    const unlocked = await request(app).patch(`/api/v1/trips/${trip.id}/draft/items/${itemId}`).send({
      expectedRevision: locked.body.data.revision,
      isLocked: false,
    });

    expect(unlocked.status).toBe(200);
    expect(unlocked.body.data.items[0]).toMatchObject({
      isLocked: false,
      location: "Jongno-gu",
      description: "Keep this text",
    });
  });

  it("creates planning resources on the first mutation without a priming GET", async () => {
    const { app, trip } = await setup();
    const itinerary = await request(app).post(`/api/v1/trips/${trip.id}/draft/items`).send({
      expectedRevision: 1,
      dayIndex: 1,
      title: "First write",
      location: "Seoul",
      localStartTime: "09:00",
      localEndTime: "10:00",
      timezone: "Asia/Seoul",
      description: "",
    });
    const currentQuote = await request(app).get(`/api/v1/trips/${trip.id}/draft/quote`);
    const quote = await request(app).post(`/api/v1/trips/${trip.id}/draft/quote/items`).send({
      expectedRevision: currentQuote.body.data.revision,
      name: "First quote",
      category: "OTHER",
      unit: "gói",
      quantity: 1,
      unitPriceMinor: 1000,
    });

    expect(itinerary.status).toBe(201);
    expect(quote.status).toBe(201);
  });

  it("rejects a quantity outside the PostgreSQL integer range", async () => {
    const { app, trip } = await setup();
    const response = await request(app).post(`/api/v1/trips/${trip.id}/draft/quote/items`).send({
      expectedRevision: 1,
      name: "Too many",
      category: "OTHER",
      unit: "gói",
      quantity: 2_147_483_648,
      unitPriceMinor: 0,
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns validation errors for an invalid activity", async () => {
    const { app, trip } = await setup();
    const response = await request(app)
      .post(`/api/v1/trips/${trip.id}/draft/items`)
      .send({ expectedRevision: 1, dayIndex: 0, title: "", localStartTime: "25:00" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates a quote item and returns a server-calculated total", async () => {
    const { app, trip } = await setup();
    const quote = await request(app).get(`/api/v1/trips/${trip.id}/draft/quote`);
    const response = await request(app)
      .post(`/api/v1/trips/${trip.id}/draft/quote/items`)
      .send({
        expectedRevision: quote.body.data.revision,
        name: "Khách sạn",
        category: "HOTEL",
        unit: "phòng/đêm",
        quantity: 8,
        unitPriceMinor: 2_500_000,
        amountMinor: 1,
      });

    expect(response.status).toBe(422);

    const accepted = await request(app)
      .post(`/api/v1/trips/${trip.id}/draft/quote/items`)
      .send({
        expectedRevision: quote.body.data.revision,
        name: "Khách sạn",
        category: "HOTEL",
        unit: "phòng/đêm",
        quantity: 8,
        unitPriceMinor: 2_500_000,
      });
    expect(accepted.status).toBe(201);
    expect(accepted.body.data).toMatchObject({ totalAmountMinor: 20_000_000, status: "COMPLETE" });
  });
});

