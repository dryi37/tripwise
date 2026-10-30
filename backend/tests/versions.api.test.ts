import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "./test-app.js";
import { InMemoryPlanningRepository } from "../src/modules/planning/infrastructure/in-memory-planning.repository.js";
import { PlanningService } from "../src/modules/planning/planning.service.js";
import type { PlanVersion, PlanVersionRepository, PlanSnapshot } from "../src/modules/versions/version.types.js";
import { VersionService } from "../src/modules/versions/version.service.js";
import { InMemoryTripRepository } from "../src/modules/trips/infrastructure/in-memory-trip.repository.js";
import { TripService } from "../src/modules/trips/trip.service.js";

class MemoryVersions implements PlanVersionRepository {
  rows: PlanVersion[] = [];
  async list(tripId: string, skip: number, take: number) { const rows = this.rows.filter((x) => x.tripId === tripId); return { rows: rows.slice(skip, skip + take), total: rows.length }; }
  async create(value: PlanVersion) { this.rows.push(value); return value; }
  async findById(tripId: string, id: string) { return this.rows.find((x) => x.tripId === tripId && x.id === id) ?? null; }
  async restore(_tripId: string, snapshot: PlanSnapshot, expectedRevision: number, _expectedDraftRevision: number, _expectedQuoteRevision: number) { return snapshot.trip.revision === expectedRevision ? { kind: "updated" as const, value: snapshot } : { kind: "conflict" as const, currentRevision: snapshot.trip.revision }; }
}

async function setup() {
  let id = 0; const dependencies = { createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`, now: () => new Date("2026-10-27T09:00:00.000Z") };
  const trips = new InMemoryTripRepository(); const tripService = new TripService(trips, dependencies); const planningService = new PlanningService(trips, new InMemoryPlanningRepository(), dependencies, undefined, undefined, "Asia/Ho_Chi_Minh");
  const trip = await tripService.create({ title: "Seoul", customerName: "Minh", origin: "HCM", destination: "Seoul", startDate: "2027-04-05", endDate: "2027-04-09", travelers: 6, budgetAmountMinor: 120_000_000, budgetCurrency: "VND" });
  const versionService = new VersionService(new MemoryVersions(), tripService, planningService, dependencies);
  return { app: createTestApp({ tripService, planningService, versionService }), trip };
}

describe("plan versions API", () => {
  it("saves, lists and restores an immutable planning snapshot", async () => {
    const { app, trip } = await setup();
    const saved = await request(app).post(`/api/v1/trips/${trip.id}/versions`).send({ name: "Phương án 1", expectedRevision: 1 });
    const listed = await request(app).get(`/api/v1/trips/${trip.id}/versions?page=1&pageSize=10`);
    const restored = await request(app).post(`/api/v1/trips/${trip.id}/versions/${saved.body.data.id}/restore`).send({ expectedRevision: 1, expectedDraftRevision: 1, expectedQuoteRevision: 1 });

    expect(saved.status).toBe(201);
    expect(saved.body.data.snapshot).toBeUndefined();
    expect(listed.body.pagination.totalItems).toBe(1);
    expect(restored.status).toBe(200);
    expect(restored.body.data).toHaveProperty("trip.title", "Seoul");
    expect(restored.body.data).toHaveProperty("draft.items");
    expect(restored.body.data).toHaveProperty("quote.items");
  });
});

