import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestApp } from "./test-app.js";
import { InMemoryTripRepository } from "../src/modules/trips/infrastructure/in-memory-trip.repository.js";
import { TripService } from "../src/modules/trips/trip.service.js";
import { InMemoryPlanningRepository } from "../src/modules/planning/infrastructure/in-memory-planning.repository.js";
import { PlanningService } from "../src/modules/planning/planning.service.js";

function testApp() {
  const trips = new InMemoryTripRepository();
  return createTestApp({
    tripService: new TripService(trips),
    planningService: new PlanningService(trips, new InMemoryPlanningRepository(), undefined, undefined, undefined, "Asia/Ho_Chi_Minh"),
  });
}

describe("health API", () => {
  it("reports that the API is healthy", async () => {
    const response = await request(testApp()).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: "ok" } });
  });

  it("returns the shared error envelope for unknown routes", async () => {
    const response = await request(testApp()).get("/api/v1/unknown");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "Route not found",
      },
    });
  });
});

describe("browser API access", () => {
  it("allows the local frontend origin, idempotency, and correlation headers", async () => {
    const response = await request(testApp()).options("/api/v1/trips").set("Origin", "http://localhost:8080");
    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:8080");
    expect(response.headers["access-control-allow-headers"]).toContain("Idempotency-Key");
    expect(response.headers["access-control-allow-headers"]).toContain("X-Client-Run-Id");
  });
});

