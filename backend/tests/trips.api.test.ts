import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createTestApp } from "./test-app.js";
import { InMemoryTripRepository } from "../src/modules/trips/infrastructure/in-memory-trip.repository.js";
import { TripService } from "../src/modules/trips/trip.service.js";
import { InMemoryPlanningRepository } from "../src/modules/planning/infrastructure/in-memory-planning.repository.js";
import { PlanningService } from "../src/modules/planning/planning.service.js";

const tripPayload = {
  title: "Seoul — Hành trình gia đình",
  customerName: "Gia đình anh Minh",
  origin: "Ho Chi Minh City",
  destination: "Seoul",
  startDate: "2027-04-05",
  endDate: "2027-04-09",
  travelers: 6,
  budgetAmountMinor: 120_000_000,
  budgetCurrency: "VND",
};

function testApp() {
  let sequence = 0;
  const repository = new InMemoryTripRepository();
  const service = new TripService(repository, {
    createId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    now: () => new Date(`2026-10-27T03:00:${String(sequence).padStart(2, "0")}.000Z`),
  });
  return createTestApp({
    tripService: service,
    planningService: new PlanningService(repository, new InMemoryPlanningRepository(), undefined, undefined, undefined, "Asia/Ho_Chi_Minh"),
  });
}

describe("trips API", () => {
  it("creates and retrieves a trip", async () => {
    const app = testApp();
    const created = await request(app).post("/api/v1/trips").send(tripPayload);
    const fetched = await request(app).get(`/api/v1/trips/${created.body.data.id}`);

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ ...tripPayload, status: "DRAFT", revision: 1 });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.id).toBe(created.body.data.id);
  });

  it("logs trip creation with a client correlation id without logging the request body", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const correlationId = "fb4e802a-13ce-4d79-b995-3ef41d300000";
    try {
      const response = await request(testApp()).post("/api/v1/trips")
        .set("X-Client-Run-Id", correlationId)
        .send({ ...tripPayload, customerName: "private customer" });

      const events = log.mock.calls.map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>);
      expect(response.status).toBe(201);
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({ event: "http.trip.create.started", runId: correlationId }),
        expect.objectContaining({ event: "http.trip.create.completed", runId: correlationId, tripId: response.body.data.id, status: 201 }),
      ]));
      expect(JSON.stringify(events)).not.toContain("private customer");
    } finally {
      log.mockRestore();
    }
  });

  it("persists detailed party counts and planning intake fields", async () => {
    const app = testApp();
    const response = await request(app).post("/api/v1/trips").send({
      ...tripPayload,
      adultCount: 4,
      childCount: 2,
      customerRequest: "Ưu tiên lịch trình nhẹ nhàng",
      planningStarted: true,
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      travelers: 6,
      adultCount: 4,
      childCount: 2,
      customerRequest: "Ưu tiên lịch trình nhẹ nhàng",
      planningStarted: true,
    });
  });

  it("lists and filters trips", async () => {
    const app = testApp();
    await request(app).post("/api/v1/trips").send(tripPayload);
    await request(app).post("/api/v1/trips").send({
      ...tripPayload,
      title: "Tokyo food tour",
      destination: "Tokyo",
    });

    const response = await request(app).get("/api/v1/trips?q=seoul&pageSize=10");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].destination).toBe("Seoul");
    expect(response.body.page.nextCursor).toBeNull();
  });

  it("updates a trip using optimistic revision control", async () => {
    const app = testApp();
    const created = await request(app).post("/api/v1/trips").send(tripPayload);

    const response = await request(app)
      .patch(`/api/v1/trips/${created.body.data.id}`)
      .send({ expectedRevision: 1, title: "Seoul đã cập nhật" });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ title: "Seoul đã cập nhật", revision: 2 });
  });

  it("returns not found when updating a missing trip", async () => {
    const response = await request(testApp())
      .patch("/api/v1/trips/c372a645-27d8-4c38-b75f-f838d62f6093")
      .send({ expectedRevision: 1, title: "Missing" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("TRIP_NOT_FOUND");
  });

  it("rejects a stale update and preserves the accepted update", async () => {
    const app = testApp();
    const created = await request(app).post("/api/v1/trips").send(tripPayload);
    const url = `/api/v1/trips/${created.body.data.id}`;
    await request(app).patch(url).send({ expectedRevision: 1, title: "Accepted" });

    const stale = await request(app).patch(url).send({ expectedRevision: 1, title: "Stale" });
    const fetched = await request(app).get(url);

    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({
      code: "REVISION_CONFLICT",
      details: { currentRevision: 2 },
    });
    expect(fetched.body.data.title).toBe("Accepted");
  });

  it("rejects a malformed pagination cursor", async () => {
    const cursor = Buffer.from(JSON.stringify({
      updatedAt: "2026-10-27T03:00:00.000Z",
      id: "not-a-uuid",
    })).toString("base64url");
    const response = await request(testApp()).get(`/api/v1/trips?cursor=${cursor}`);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("INVALID_CURSOR");
  });

  it("rejects invalid and unknown create fields", async () => {
    const response = await request(testApp()).post("/api/v1/trips").send({
      ...tripPayload,
      travelers: 0,
      unexpected: true,
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details).toBeInstanceOf(Array);
  });

  it("rejects a non-ISO currency code", async () => {
    const response = await request(testApp()).post("/api/v1/trips").send({
      ...tripPayload,
      budgetCurrency: "$$$",
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns a structured client error for malformed JSON", async () => {
    const response = await request(testApp())
      .post("/api/v1/trips")
      .set("Content-Type", "application/json")
      .send('{"title":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: "INVALID_JSON", message: "Request body contains invalid JSON" },
    });
  });

  it("returns a structured error for a missing trip", async () => {
    const response = await request(testApp())
      .get("/api/v1/trips/c372a645-27d8-4c38-b75f-f838d62f6093");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: "TRIP_NOT_FOUND", message: "Trip not found" },
    });
  });
});

