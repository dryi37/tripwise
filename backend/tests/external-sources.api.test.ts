import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "./test-app.js";
import { ExternalSourceService } from "../src/modules/external-sources/external-source.service.js";
import { InMemoryExternalSourceRepository } from "../src/modules/external-sources/infrastructure/in-memory-external-source.repository.js";
import { InMemoryPlanningRepository } from "../src/modules/planning/infrastructure/in-memory-planning.repository.js";
import { PlanningService } from "../src/modules/planning/planning.service.js";
import { InMemoryTripRepository } from "../src/modules/trips/infrastructure/in-memory-trip.repository.js";
import { TripService } from "../src/modules/trips/trip.service.js";

describe("external sources API", () => {
  it("lists persisted citations for one trip", async () => {
    const repository = new InMemoryTripRepository(); const trips = new TripService(repository); const planning = new PlanningService(repository, new InMemoryPlanningRepository());
    const trip = await trips.create({ title: "Seoul", customerName: "Lan", origin: "Hanoi", destination: "Seoul", startDate: "2027-04-05", endDate: "2027-04-06", travelers: 2, budgetAmountMinor: 20_000_000, budgetCurrency: "VND" });
    const sources = new ExternalSourceService(new InMemoryExternalSourceRepository(), { createId: () => "source-1", now: () => new Date("2026-10-27T00:00:00Z") });
    await sources.persistSearchResults(trip.id, [{ resultKey: "x", name: "Place", title: "Official", url: "https://example.com/place", canonicalUrl: "https://example.com/place", publisher: "Official", domain: "example.com", excerpt: "VND 100,000", amountMinor: 100_000, currency: "VND", pricingUnit: "ticket", audience: "adult", retrievedAt: "2026-10-27T00:00:00Z", suitable: true, constraints: [], confidence: 0.8, stale: false, verificationStatus: "UNVERIFIED", conflicts: [] }]);

    const response = await request(createTestApp({ tripService: trips, planningService: planning, externalSourceService: sources })).get(`/api/v1/trips/${trip.id}/external-sources`);
    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({ id: "source-1", canonicalUrl: "https://example.com/place", verificationStatus: "UNVERIFIED", confidence: 0.8 });
  });
});

