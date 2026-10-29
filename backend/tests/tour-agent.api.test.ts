import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createTestApp } from "./test-app.js";
import type { AgentModel } from "../src/modules/agent/agent-model.js";
import { TourAgentService } from "../src/modules/agent/tour-agent.service.js";
import type { CatalogService } from "../src/modules/catalog/catalog.service.js";
import { InMemoryPlanningRepository } from "../src/modules/planning/infrastructure/in-memory-planning.repository.js";
import { PlanningService } from "../src/modules/planning/planning.service.js";
import { InMemoryTripRepository } from "../src/modules/trips/infrastructure/in-memory-trip.repository.js";
import { TripService } from "../src/modules/trips/trip.service.js";

async function setup() {
  const repository = new InMemoryTripRepository();
  const trips = new TripService(repository);
  const planning = new PlanningService(repository, new InMemoryPlanningRepository());
  const model: AgentModel = {
    decide: async ({ turn }) => turn === 1
      ? { type: "tool_calls", calls: [{ name: "search_supplier_offers", arguments: { query: "Tokyo Tower admission price" } }] }
      : turn === 2
        ? { type: "tool_calls", calls: [1, 2, 3].map((dayIndex) => ({ name: "add_itinerary_item", arguments: { dayIndex, title: `Tokyo Tower ngày ${dayIndex}`, location: "Tokyo", localStartTime: "10:00", localEndTime: "12:00", timezone: "Asia/Tokyo", description: "Tham quan ngắm cảnh", unpricedReason: "Không có giá nội bộ phù hợp." } })) }
        : { type: "final", text: "Bản nháp đã sẵn sàng." },
  };
  const catalog = {
    list: async () => ({ data: [], pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 } }),
    searchForAgent: async () => [],
  } as unknown as CatalogService;
  const agent = new TourAgentService(trips, planning, model, 20, 60, catalog, undefined, undefined, undefined, 300_000);
  const trip = await trips.create({
    title: "Tokyo",
    customerName: "Lan",
    origin: "Hanoi",
    destination: "Tokyo",
    startDate: "2027-05-01",
    endDate: "2027-05-03",
    travelers: 2,
    budgetAmountMinor: 40_000_000,
    budgetCurrency: "VND",
  });
  return { app: createTestApp({ tripService: trips, planningService: planning, tourAgentService: agent }), trip };
}

describe("tour agent API", () => {
  it("runs the tour agent for an existing trip", async () => {
    const { app, trip } = await setup();
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const correlationId = "fb4e802a-13ce-4d79-b995-3ef41d300001";
    try {
      const response = await request(app)
        .post(`/api/v1/trips/${trip.id}/agent/runs`)
        .set("X-Client-Run-Id", correlationId)
        .send({ instruction: "Tạo lịch trình ít đi bộ" });

      const events = log.mock.calls.map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ summary: expect.stringContaining("Bản nháp đã sẵn sàng."), modelTurns: 3 });
      expect(response.body.data.warnings).toHaveLength(3);
      expect(response.body.data.warnings[0]).toContain("chưa có giá được xác minh");
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({ event: "http.agent.request.started", runId: correlationId, tripId: trip.id }),
        expect.objectContaining({ event: "http.agent.request.completed", runId: correlationId, tripId: trip.id, status: 200 }),
        expect.objectContaining({ event: "tour_agent.run.started", runId: correlationId, tripId: trip.id }),
      ]));
    } finally {
      log.mockRestore();
    }
  });

  it("validates the instruction", async () => {
    const { app, trip } = await setup();
    const response = await request(app)
      .post(`/api/v1/trips/${trip.id}/agent/runs`)
      .send({ instruction: "" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects undeclared query parameters", async () => {
    const { app, trip } = await setup();
    const response = await request(app)
      .post(`/api/v1/trips/${trip.id}/agent/runs?unsafe=true`)
      .send({ instruction: "Tạo lịch trình" });

    expect(response.status).toBe(422);
  });
});


