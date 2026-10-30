import { describe, expect, it, vi } from "vitest";

import type { AgentDecision, AgentModel, AgentModelCallOptions, AgentModelInput } from "../src/modules/agent/agent-model.js";
import { TourAgentService } from "../src/modules/agent/tour-agent.service.js";
import { InMemoryPlanningRepository } from "../src/modules/planning/infrastructure/in-memory-planning.repository.js";
import { PlanningService } from "../src/modules/planning/planning.service.js";
import { InMemoryTripRepository } from "../src/modules/trips/infrastructure/in-memory-trip.repository.js";
import { TripService } from "../src/modules/trips/trip.service.js";
import type { KnowledgeService } from "../src/modules/knowledge/knowledge.service.js";
import type { CatalogService } from "../src/modules/catalog/catalog.service.js";
import { ExternalSourceService } from "../src/modules/external-sources/external-source.service.js";
import { InMemoryExternalSourceRepository } from "../src/modules/external-sources/infrastructure/in-memory-external-source.repository.js";
import { WebSearchService } from "../src/modules/web-search/web-search.service.js";
import { PlaceSearchStore } from "../src/modules/places/place-search.store.js";
import { PlacesService } from "../src/modules/places/places.service.js";

class ScriptedModel implements AgentModel {
  readonly inputs: AgentModelInput[] = [];

  constructor(private readonly decisions: AgentDecision[]) {}

  async decide(input: AgentModelInput, _options?: AgentModelCallOptions): Promise<AgentDecision> {
    this.inputs.push(input);
    const decision = this.decisions.shift();
    if (!decision) throw new Error("No scripted decision");
    return decision;
  }
}

async function setup(model: AgentModel, maxIterations = 20, maxToolCalls = 60, requestTimeoutMs = 300_000, catalog?: CatalogService) {
  let id = 0;
  const dependencies = {
    createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    now: () => new Date("2026-10-27T04:00:00.000Z"),
  };
  const repository = new InMemoryTripRepository();
  const trips = new TripService(repository, dependencies);
  const externalSources = new ExternalSourceService(new InMemoryExternalSourceRepository(), dependencies);
  const planningRepository = new InMemoryPlanningRepository();
  const planning = new PlanningService(repository, planningRepository, dependencies, undefined, externalSources, "Asia/Ho_Chi_Minh");
  const trip = await trips.create({
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
  return { agent: new TourAgentService(trips, planning, model, maxIterations, maxToolCalls, catalog, undefined, undefined, undefined, requestTimeoutMs), trips, planning, planningRepository, dependencies, tripRepository: repository, trip, externalSources };
}

async function setupWithKnowledge(model: AgentModel) {
  const result = await setup(model);
  const knowledge = { search: vi.fn(async () => [{ documentId: "doc-1", chunkId: "chunk-1", title: "Seoul cho gia đình", sourceLabel: "Nội bộ", content: "Nên bố trí thời gian nghỉ trưa cho trẻ nhỏ.", score: 0.91 }]) } as unknown as KnowledgeService;
  return { ...result, knowledge, agent: new TourAgentService(result.trips, result.planning, model, 20, 60, undefined, knowledge, undefined, undefined, 300_000) };
}

describe("TourAgentService", () => {
  it("requires an exact same-run Google Places candidate and persists its Place ID", async () => {
    const result = await setup(new ScriptedModel([]));
    const places = new PlacesService({
      search: async () => [{ googlePlaceId: "ChIJ-seoul-palace", displayName: "Gyeongbokgung Palace", formattedAddress: "Jongno-gu, Seoul", latitude: 37.5796, longitude: 126.977 }],
      getDetails: async (googlePlaceId) => ({ googlePlaceId, displayName: "Gyeongbokgung Palace", formattedAddress: "Jongno-gu, Seoul", latitude: 37.5796, longitude: 126.977 }),
    }, new PlaceSearchStore(60_000, 20), result.trips, 5);
    const planning = new PlanningService(result.tripRepository, new InMemoryPlanningRepository(), result.dependencies, undefined, undefined, "Asia/Ho_Chi_Minh", undefined, places);
    const model: AgentModel = {
      decide: async (input) => {
        if (input.turn === 1) return { type: "tool_calls", calls: [{ name: "search_places", arguments: { query: "Gyeongbokgung Palace" } }] };
        const searchResult = input.toolResults?.find((entry) => entry.tool === "search_places")?.result as Array<{ googlePlaceId: string }> | undefined;
        const confirmation = input.toolResults?.flatMap((entry) => Array.isArray(entry.result) ? [] : [entry.result]).find((item) => item && typeof item === "object" && (item as { reason?: string }).reason === "PRICE_RESEARCH_CONFIRMATION_REQUIRED") as { confirmationId?: string } | undefined;
        const args = { dayIndex: 1, title: "Gyeongbokgung Palace visit", localStartTime: "09:00", localEndTime: "11:00", description: "Visit the palace", selectionReason: "Matches the customer's history interest", googlePlaceId: searchResult?.[0]?.googlePlaceId, unpricedReason: "Chưa tìm được giá đáng tin cậy." , ...(confirmation?.confirmationId ? { unpricedConfirmationId: confirmation.confirmationId } : {}) };
        if (!confirmation) return { type: "tool_calls", calls: [{ name: "add_itinerary_item", arguments: args }] };
        if (input.turn === 2) return { type: "tool_calls", calls: [{ name: "add_itinerary_item", arguments: args }] };
        if (input.turn === 3) return { type: "tool_calls", calls: [{ name: "add_itinerary_item", arguments: args }] };
        return { type: "final", text: "Đã thêm địa điểm cụ thể." };
      },
    };
    const agent = new TourAgentService(result.trips, planning, model, 20, 60, undefined, undefined, undefined, undefined, 300_000, places);
    const run = await agent.run(result.trip.id, { instruction: "Add a visit to Gyeongbokgung Palace" });
    expect(run.draft.items).toMatchObject([{ googlePlaceId: "ChIJ-seoul-palace", selectionReason: "Matches the customer's history interest" }]);
    expect(run.draft.items[0]?.googlePlaceId).toBe("ChIJ-seoul-palace");
  });

  it("logs correlated run, model, and tool events without logging the instruction", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const model = new ScriptedModel([
      { type: "tool_calls", calls: [
        { name: "search_supplier_offers", arguments: { query: "Gyeongbokgung ticket price Seoul" } },
        { name: "add_itinerary_item", arguments: { dayIndex: 1, title: "Gyeongbokgung", location: "Seoul", localStartTime: "09:00", localEndTime: "11:00", description: "Visit", unpricedReason: "Không có giá phù hợp." } },
      ] },
      { type: "final", text: "Đã thêm lịch trình." },
    ]);
    const logCatalog = { searchForAgent: vi.fn(async () => []) } as unknown as CatalogService;
    const { agent, trip } = await setup(model, 20, 60, 300_000, logCatalog);

    try {
      await agent.run(trip.id, { instruction: "private customer instruction" });

      const events = log.mock.calls.map(([entry]) => JSON.parse(String(entry)) as { event: string; runId: string });
      expect(events.map((entry) => entry.event)).toEqual(expect.arrayContaining([
        "tour_agent.run.started",
        "tour_agent.model.started",
        "tour_agent.model.completed",
        "tour_agent.tool.started",
        "tour_agent.tool.completed",
        "tour_agent.run.completed",
      ]));
      expect(new Set(events.map((entry) => entry.runId)).size).toBe(1);
      expect(JSON.stringify(events)).not.toContain("private customer instruction");
      expect(logCatalog.searchForAgent).toHaveBeenCalledWith({ query: "Gyeongbokgung ticket price Seoul" });
    } finally {
      log.mockRestore();
    }
  });

  it("aborts a model call at the configured total run deadline", async () => {
    const model: AgentModel = {
      decide: async (_input, options) => new Promise((_resolve, reject) => {
        const signal = options?.signal;
        if (!signal) return reject(new Error("Expected an abort signal"));
        if (signal.aborted) return reject(signal.reason);
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    };
    const { agent, trip } = await setup(model, 20, 60, 20);

    await expect(agent.run(trip.id, { instruction: "Tạo lịch trình" })).rejects.toMatchObject({
      status: 504,
      code: "AGENT_TIMEOUT",
    });
  });

  it("executes validated itinerary tools across model turns", async () => {
    const catalog = { searchForAgent: vi.fn(async () => []) } as unknown as CatalogService;
    const model = new ScriptedModel([
      {
        type: "tool_calls",
        calls: [
          { name: "search_supplier_offers", arguments: { query: "Gyeongbokgung Bukchon Hanok ticket price Seoul" } },
          {
            name: "add_itinerary_item",
            arguments: {
              dayIndex: 1,
              title: "Cung điện Gyeongbokgung",
              location: "Jongno-gu, Seoul",
              localStartTime: "09:00",
              localEndTime: "11:00",
              description: "Tham quan nhẹ nhàng cho gia đình",
              unpricedReason: "Không có offer nội bộ phù hợp.",
            },
          },
          {
            name: "add_itinerary_item",
            arguments: {
              dayIndex: 1,
              title: "Làng Bukchon Hanok",
              location: "Jongno-gu, Seoul",
              localStartTime: "13:30",
              localEndTime: "15:30",
              description: "Đi bộ và chụp ảnh",
              unpricedReason: "Không có offer nội bộ phù hợp.",
            },
          },
        ],
      },
      { type: "final", text: "Đã tạo bản nháp ngày đầu tiên." },
    ]);
    const { agent, planning, trip } = await setup(model, 20, 60, 300_000, catalog);

    const result = await agent.run(trip.id, { instruction: "Lên lịch ngày đầu nhẹ nhàng" });

    expect(result).toMatchObject({ summary: expect.stringContaining("Đã tạo bản nháp ngày đầu tiên."), modelTurns: 2, toolsExecuted: 3 });
    expect(result.draft.items.map((item) => item.title)).toEqual([
      "Cung điện Gyeongbokgung",
      "Làng Bukchon Hanok",
    ]);
    expect((await planning.getDraft(trip.id)).revision).toBe(3);
    expect(model.inputs[1]?.draft.items).toHaveLength(2);
  });

  it("adds a verified internal offer to the quote when an itinerary activity is linked to it", async () => {
    const offer = {
      id: "00000000-0000-4000-8000-000000000099",
      serviceId: "service-palace",
      unitPriceMinor: 30_000,
      currency: "VND",
      validFrom: null,
      validUntil: null,
      details: "Giá vé tham khảo",
      status: "VERIFIED",
      createdAt: new Date("2026-10-28T00:00:00Z"),
      updatedAt: new Date("2026-10-28T00:00:00Z"),
      service: { id: "service-palace", name: "Gyeongbokgung Palace ticket", category: "Tham quan", unit: "vé", isActive: true, createdAt: new Date(), updatedAt: new Date(), offer: null },
    };
    const model = new ScriptedModel([
      { type: "tool_calls", calls: [{ name: "search_supplier_offers", arguments: { query: "Gyeongbokgung Palace ticket price Seoul" } }] },
      { type: "tool_calls", calls: [{ name: "add_itinerary_item", arguments: { dayIndex: 1, title: "Gyeongbokgung", location: "Seoul", localStartTime: "09:00", localEndTime: "11:00", description: "Tham quan cung điện", supplierOfferId: offer.id } }] },
      { type: "final", text: "Đã thêm hoạt động và báo giá." },
    ]);
    const base = await setup(model);
    const catalog = { searchForAgent: vi.fn(async () => [{ ...offer.service, offers: [offer] }]), getOfferForQuote: vi.fn(async () => offer) } as unknown as CatalogService;
    const planning = new PlanningService(base.tripRepository, base.planningRepository, base.dependencies, catalog, base.externalSources, "Asia/Ho_Chi_Minh");
    const agent = new TourAgentService(base.trips, planning, model, 20, 60, catalog, undefined, undefined, undefined, 300_000);

    const result = await agent.run(base.trip.id, { instruction: "Thêm cung điện và đồng bộ giá vé nội bộ" });

    expect(result.draft.items).toMatchObject([{ title: "Gyeongbokgung", supplierOfferId: offer.id }]);
    expect((await planning.getQuote(base.trip.id)).items).toMatchObject([
      { supplierOfferId: offer.id, name: "Gyeongbokgung Palace ticket", quantity: 6, unitPriceMinor: 30_000 },
    ]);
  });

  it("requires a place-specific price lookup before saving an unpriced itinerary activity", async () => {
    const model = new ScriptedModel([
      { type: "tool_calls", calls: [{ name: "add_itinerary_item", arguments: { dayIndex: 1, title: "Gyeongbokgung Palace", location: "Seoul", localStartTime: "09:00", localEndTime: "11:00", description: "Visit the palace", unpricedReason: "Chưa tìm thấy giá phù hợp cho chuyến đi." } }] },
      { type: "tool_calls", calls: [{ name: "search_supplier_offers", arguments: { query: "Gyeongbokgung Palace admission price" } }] },
      { type: "tool_calls", calls: [{ name: "add_itinerary_item", arguments: { dayIndex: 1, title: "Gyeongbokgung Palace", location: "Seoul", localStartTime: "09:00", localEndTime: "11:00", description: "Visit the palace", unpricedReason: "Không có offer nội bộ phù hợp." } }] },
      { type: "final", text: "Đã thêm gợi ý chưa có giá." },
    ]);
    const base = await setup(model);
    await base.tripRepository.updateIfRevision(base.trip.id, base.trip.revision, { endDate: base.trip.startDate }, base.dependencies.now());
    const catalog = { searchForAgent: vi.fn(async () => []) } as unknown as CatalogService;
    const agent = new TourAgentService(base.trips, base.planning, model, 20, 60, catalog, undefined, undefined, undefined, 300_000);

    const result = await agent.run(base.trip.id, { instruction: "Tạo lịch trình Seoul" });
    const quote = await base.planning.getQuote(base.trip.id);

    expect(result.draft.items).toHaveLength(1);
    expect(result.draft.items[0]).not.toHaveProperty("unpricedReason");
    expect(quote.items).toMatchObject([{
      name: "Gyeongbokgung Palace",
      unitPriceMinor: null,
      amountMinor: null,
      priceStatus: "NEEDS_REVIEW",
        sourceType: "UNPRICED",
        category: "ACTIVITY",
        unit: "visit",
        
      itineraryItemId: result.draft.items[0]?.id,
    }]);
    expect(quote.totalAmountMinor).toBe(0);
    const activity = result.draft.items[0]!;
    await base.planning.deleteItineraryItem(base.trip.id, activity.id, result.draft.revision);
    expect((await base.planning.getQuote(base.trip.id)).items).toHaveLength(0);
    expect(result.warnings).toEqual([expect.stringContaining("chưa có giá được xác minh")]);
    expect(result.summary).toContain("Lưu ý giá:");
    expect(model.inputs[1]?.toolResults?.[0]).toMatchObject({ tool: "add_itinerary_item", result: { applied: false, reason: "PLACE_PRICE_SEARCH_REQUIRED" } });
    expect(model.inputs[2]?.toolResults?.[1]).toMatchObject({ tool: "search_supplier_offers", query: "Gyeongbokgung Palace admission price", result: [] });
  });

  it("allows an unpriced activity after research found no place-specific match", async () => {
    const model = new ScriptedModel([
      { type: "tool_calls", calls: [{ name: "search_supplier_offers", arguments: { query: "Seoul trip prices" } }] },
      { type: "tool_calls", calls: [{ name: "add_itinerary_item", arguments: { dayIndex: 1, title: "Dạo khu trung tâm", location: "Seoul", localStartTime: "09:00", localEndTime: "11:00", description: "Gợi ý khám phá khu vực trung tâm", unpricedReason: "Không tìm thấy giá phù hợp." } }] },
      { type: "final", text: "Đã thêm gợi ý chưa có giá." },
    ]);
    const catalog = { searchForAgent: vi.fn(async () => []) } as unknown as CatalogService;
    const { agent, trip } = await setup(model, 20, 60, 300_000, catalog);

    const result = await agent.run(trip.id, { instruction: "Thêm gợi ý hoạt động ở Seoul" });

    expect(result.draft.items).toHaveLength(1);
    expect(result.draft.items[0]?.title).toBe("Dạo khu trung tâm");
    expect(result.warnings).toEqual([expect.stringContaining("chưa có giá được xác minh")]);
  });

  it("does not let an explicit itinerary request finish with no activities", async () => {
    const model = new ScriptedModel([
      { type: "final", text: "Tôi đã tìm được thông tin." },
      { type: "tool_calls", calls: [{ name: "search_supplier_offers", arguments: { query: "Gyeongbokgung Palace ticket price" } }] },
      { type: "tool_calls", calls: [{ name: "add_itinerary_item", arguments: { dayIndex: 1, title: "Gyeongbokgung Palace", location: "Seoul", localStartTime: "09:00", localEndTime: "11:00", description: "Tham quan cung điện", unpricedReason: "Không có giá phù hợp trong nguồn đã tra." } }] },
      { type: "final", text: "Đã thêm Gyeongbokgung vào lịch trình." },
    ]);
    const catalog = { searchForAgent: vi.fn(async () => []) } as unknown as CatalogService;
    const { agent, trip, tripRepository, dependencies } = await setup(model, 20, 60, 300_000, catalog);
    await tripRepository.updateIfRevision(trip.id, trip.revision, { endDate: trip.startDate }, dependencies.now());

    const result = await agent.run(trip.id, { instruction: "Tạo lịch trình Seoul một ngày" });

    expect(result.draft.items).toHaveLength(1);
    expect(model.inputs[1]?.toolResults).toContainEqual(expect.objectContaining({
      tool: "itinerary_completion_required",
    }));
  });

  it("does not let an explicit itinerary finish when any trip day has no activity", async () => {
    const model = new ScriptedModel([
      { type: "tool_calls", calls: [{ name: "search_supplier_offers", arguments: { query: "Gyeongbokgung admission Seoul" } }] },
      { type: "tool_calls", calls: [{ name: "add_itinerary_item", arguments: { dayIndex: 1, title: "Gyeongbokgung", location: "Seoul", localStartTime: "09:00", localEndTime: "11:00", description: "Tham quan cung điện", unpricedReason: "Chưa có giá phù hợp." } }] },
      { type: "final", text: "Đã thêm ngày đầu." },
      { type: "tool_calls", calls: [{ name: "search_supplier_offers", arguments: { query: "Bukchon Hanok village Seoul" } }] },
      { type: "tool_calls", calls: [{ name: "add_itinerary_item", arguments: { dayIndex: 2, title: "Bukchon Hanok Village", location: "Seoul", localStartTime: "10:00", localEndTime: "12:00", description: "Dạo làng Hanok", unpricedReason: "Chưa có giá phù hợp." } }] },
      { type: "final", text: "Đã thêm hoạt động cho cả hai ngày." },
    ]);
    const catalog = { searchForAgent: vi.fn(async () => []) } as unknown as CatalogService;
    const { agent, trip, tripRepository, dependencies } = await setup(model, 20, 60, 300_000, catalog);
    await tripRepository.updateIfRevision(trip.id, trip.revision, { endDate: "2027-04-06" }, dependencies.now());

    const result = await agent.run(trip.id, { instruction: "Hoàn thiện lịch trình Seoul 2 ngày" });

    expect(result.draft.items.map((item) => item.dayIndex)).toEqual([1, 2]);
    expect(model.inputs[3]?.toolResults).toContainEqual(expect.objectContaining({
      tool: "itinerary_completion_required",
      result: expect.objectContaining({ reason: "ITINERARY_DAYS_INCOMPLETE", missingDayIndices: [2] }),
    }));
  });

  it("rejects unknown tools without executing them", async () => {
    const model = new ScriptedModel([
      { type: "tool_calls", calls: [{ name: "book_hotel", arguments: { hotel: "Anything" } }] },
    ]);
    const { agent, trip } = await setup(model);

    await expect(agent.run(trip.id, { instruction: "Đặt khách sạn" })).rejects.toMatchObject({
      status: 422,
      code: "AGENT_TOOL_REJECTED",
    });
  });

  it("rejects an entire invalid tool batch then lets the model correct it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const model = new ScriptedModel([
      {
        type: "tool_calls",
        calls: [
          { name: "add_itinerary_item", arguments: { dayIndex: 1, title: "Valid first item", location: "Seoul", localStartTime: "09:00", localEndTime: "10:00", description: "" } },
          { name: "add_itinerary_item", arguments: { dayIndex: 999 } },
        ],
      },
      {
        type: "tool_calls",
        calls: [
          { name: "search_supplier_offers", arguments: { query: "Valid first item Seoul" } },
          { name: "add_itinerary_item", arguments: { dayIndex: 1, title: "Valid first item", location: null, localStartTime: "9:00 AM", localEndTime: "10:00 AM", description: "Gợi ý tham quan", unpricedReason: `Chưa có nguồn giá phù hợp. ${"x".repeat(300)}` } },
        ],
      },
      { type: "final", text: "Đã thêm hoạt động." },
    ]);
    const catalog = { searchForAgent: vi.fn(async () => []) } as unknown as CatalogService;
    const { agent, planning, trip } = await setup(model, 20, 60, 300_000, catalog);

    const result = await agent.run(trip.id, { instruction: "Thêm một hoạt động vào chuyến đi" });

    expect(result.draft.items).toHaveLength(1);
    expect(result.draft.items[0]?.localStartTime).toBe("09:00");
    expect(result.draft.items[0]?.location).toBe("");
    expect(model.inputs[1]?.draft.items).toHaveLength(0);
    expect(model.inputs[1]?.toolResults).toContainEqual(expect.objectContaining({
      tool: "add_itinerary_item",
      result: expect.objectContaining({ applied: false, reason: "INVALID_TOOL_ARGUMENTS" }),
    }));
    expect(result.warnings[0]?.length).toBeLessThanOrEqual(300);
    const warningEvents = warn.mock.calls.map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>);
    expect(warningEvents).toContainEqual(expect.objectContaining({ event: "tour_agent.tool.arguments_rejected", invalidFields: expect.arrayContaining(["title"]) }));
    warn.mockRestore();
  });

  it("stops a model that never returns a final response", async () => {
    const emptyCall: AgentDecision = { type: "tool_calls", calls: [] };
    const model = new ScriptedModel([emptyCall, emptyCall]);
    const { agent, trips, trip } = await setup(model, 2);
    await trips.update(trip.id, { expectedRevision: trip.revision, endDate: trip.startDate });

    await expect(agent.run(trip.id, { instruction: "Tạo tour" })).rejects.toMatchObject({
      status: 503,
      code: "AGENT_ITERATION_LIMIT",
    });
    expect(model.inputs).toHaveLength(2);
  });

  it("honors configured model turns beyond LangGraph's default recursion limit", async () => {
    const model = new ScriptedModel([
      ...Array.from({ length: 13 }, () => ({ type: "tool_calls", calls: [] }) as AgentDecision),
      { type: "final", text: "Đã hoàn tất lịch trình." },
    ]);
    const { trips, planning, trip } = await setup(model, 14);
    const agent = new TourAgentService(trips, planning, model, 14, 60, undefined, undefined, undefined, undefined, 300_000);

    const result = await agent.run(trip.id, { instruction: "Rà soát lịch trình một ngày" });

    expect(result.modelTurns).toBe(14);
    expect(result.summary).toBe("Đã hoàn tất lịch trình.");
  });

  it("falls back to destination when a natural supplier query has no exact catalog match", async () => {
    const model = new ScriptedModel([
      { type: "tool_calls", calls: [{ name: "search_supplier_offers", arguments: { query: "family hotel for a relaxing Seoul trip" } }] },
      { type: "final", text: "Có dịch vụ demo nội bộ cho Seoul." },
    ]);
    const { trips, planning, trip } = await setup(model);
    const catalogQueries: string[] = [];
    const catalog = {
      searchForAgent: vi.fn(async ({ query }: { query: string }) => {
        catalogQueries.push(query);
        if (query !== "Seoul") return [];
        return [{
            id: "service-demo-hotel",
            name: "[DEMO] Khách sạn Seoul",
            category: "Lưu trú",
            unit: "phòng/đêm",
            isActive: true,
            createdAt: new Date("2026-10-28T00:00:00Z"),
            updatedAt: new Date("2026-10-28T00:00:00Z"),
            offers: [{ id: "offer-demo-hotel", unitPriceMinor: 1_800_000, currency: "VND", validFrom: null, validUntil: null, details: "DEMO", status: "VERIFIED", createdAt: new Date(), updatedAt: new Date() }],
          }];
      }),
    } as unknown as CatalogService;
    const agent = new TourAgentService(trips, planning, model, 20, 60, catalog, undefined, undefined, undefined, 300_000);

    await agent.run(trip.id, { instruction: "Tìm giá khách sạn nội bộ ở Seoul" });

    expect(catalogQueries).toEqual(["family hotel for a relaxing Seoul trip", "Seoul"]);
    expect(JSON.stringify(model.inputs[1]?.toolResults)).toContain("offer-demo-hotel");
  });

  it("stops before exceeding the total tool-call budget", async () => {
    const activity = {
      name: "add_itinerary_item",
      arguments: {
        dayIndex: 1,
        title: "Activity",
        location: "Seoul",
        localStartTime: "09:00",
        localEndTime: "10:00",
        description: "",
        unpricedReason: "Không tìm thấy giá phù hợp.",
      },
    };
    const nextActivity = { ...activity, arguments: { ...activity.arguments, title: "Next Activity", localStartTime: "10:00", localEndTime: "11:00" } };
    const model = new ScriptedModel([
      { type: "tool_calls", calls: [
        { name: "search_supplier_offers", arguments: { query: "Activity ticket price Seoul" } }, activity, nextActivity,
      ] },
      { type: "tool_calls", calls: [activity, activity] },
    ]);
    const budgetCatalog = { searchForAgent: vi.fn(async () => []) } as unknown as CatalogService;
    const { agent, trips, planning, trip } = await setup(model, 20, 3, 300_000, budgetCatalog);
    await trips.update(trip.id, { expectedRevision: trip.revision, endDate: trip.startDate });

    await expect(agent.run(trip.id, { instruction: "Tạo tour" })).rejects.toMatchObject({
      status: 503,
      code: "AGENT_TOOL_LIMIT",
    });
    expect((await planning.getDraft(trip.id)).items).toHaveLength(2);
  });

  it("returns grounded knowledge search results to the next model turn", async () => {
    const model = new ScriptedModel([
      { type: "tool_calls", calls: [{ name: "search_knowledge", arguments: { query: "nghỉ cho trẻ em" } }] },
      { type: "final", text: "Đã dùng kinh nghiệm nội bộ để điều chỉnh nhịp độ." },
    ]);
    const { agent, trip, knowledge } = await setupWithKnowledge(model);
    const result = await agent.run(trip.id, { instruction: "Tạo lịch phù hợp trẻ nhỏ" });

    expect(knowledge.search).toHaveBeenCalledWith("nghỉ cho trẻ em");
    expect(model.inputs[1]?.toolResults?.[0]).toMatchObject({ tool: "search_knowledge" });
    expect(JSON.stringify(model.inputs[1]?.toolResults)).toContain("Nên bố trí thời gian nghỉ trưa");
    expect(result.sources).toEqual([expect.objectContaining({ title: "Seoul cho gia đình" })]);
  });

  it("searches the web, issues persisted source ids, then adds linked itinerary and estimate", async () => {
    const model = new ScriptedModel([
      { type: "tool_calls", calls: [{ name: "search_web", arguments: { query: "Lotte World official tickets" } }] },
      { type: "tool_calls", calls: [{ name: "add_place_from_external_source", arguments: { externalSourceId: "00000000-0000-4000-8000-000000000003", dayIndex: 1, localStartTime: "10:00", localEndTime: "14:00", quantity: 2 } }] },
      { type: "final", text: "Đã thêm địa điểm và giá web ước tính." },
    ]);
    const base = await setup(model);
    let providerLimit = 0;
    const web = new WebSearchService({ search: async ({ limit }) => { providerLimit = limit; return [{ resultKey: "lotte", name: "Lotte World", title: "Official tickets", url: "https://lotteworld.com/lotte", publisher: "Lotte World", excerpt: "VND 900,000", amount: 900_000, currency: "VND", pricingUnit: "person", audience: "adult", openingHours: [{ day: "MONDAY", opens: "09:00", closes: "21:00" }] }]; } }, { now: () => new Date("2026-10-27T00:00:00Z"), maxResults: 5, staleAfterDays: 180 });
    const agent = new TourAgentService(base.trips, base.planning, model, 20, 60, undefined, undefined, web, base.externalSources, 300_000);

    const result = await agent.run(base.trip.id, { instruction: "Tìm và thêm Lotte World" });

    expect(providerLimit).toBe(5);
    expect(model.inputs[1]?.toolResults?.[0]).toMatchObject({ tool: "search_web", result: [expect.objectContaining({ id: expect.any(String), canonicalUrl: "https://lotteworld.com/lotte" })] });
    expect(result.draft.items[0]).toMatchObject({ title: "Lotte World", externalSourceId: expect.any(String) });
    expect(result.draft.items[0]?.sourceUrl).toBe("https://lotteworld.com/lotte");
    expect((await base.planning.getQuote(base.trip.id)).items[0]).toMatchObject({ sourceType: "EXTERNAL", unitPriceMinor: 900_000 });
    expect((await base.planning.getQuote(base.trip.id)).items[0]?.sourceUrlSnapshot).toBe("https://lotteworld.com/lotte");
  });

  it("saves a searched external URL through the same planning flow as the API", async () => {
    const sourceUrl = "https://visitkorea.example/bukchon";
    const model = new ScriptedModel([
      { type: "tool_calls", calls: [{ name: "search_web", arguments: { query: "Bukchon Hanok Village visitor information" } }] },
      { type: "tool_calls", calls: [{ name: "add_itinerary_item", arguments: { dayIndex: 1, title: "Bukchon Hanok Village", location: "Seoul", localStartTime: "10:00", localEndTime: "12:00", description: "Tham quan làng Hanok", sourceUrl, unpricedReason: "Không tìm thấy nguồn giá đủ tin cậy." } }] },
      { type: "final", text: "Đã thêm địa điểm cùng link nguồn." },
    ]);
    const base = await setup(model);
    const web = new WebSearchService({ search: async () => [{ resultKey: "bukchon-info", name: "Bukchon Hanok Village", title: "Visitor information", url: sourceUrl, publisher: "Visit Korea", excerpt: "Visitor guidance." }] }, { now: () => new Date("2026-10-29T00:00:00Z"), maxResults: 7, staleAfterDays: 180 });
    const agent = new TourAgentService(base.trips, base.planning, model, 20, 60, undefined, undefined, web, base.externalSources, 300_000);

    const result = await agent.run(base.trip.id, { instruction: "Tìm và thêm Bukchon Hanok Village" });

    expect(result.draft.items[0]).toMatchObject({ title: "Bukchon Hanok Village", sourceUrl });
    expect((await base.planning.getQuote(base.trip.id)).items[0]).toMatchObject({ sourceUrlSnapshot: sourceUrl, priceStatus: "NEEDS_REVIEW" });
  });

  it("passes every raw web result and full excerpt to the model for its own assessment", async () => {
    const model = new ScriptedModel([
      { type: "tool_calls", calls: [{ name: "search_web", arguments: { query: "Bukchon Hanok Village visitor information" } }] },
      { type: "final", text: "Đã xem kết quả tìm kiếm." },
    ]);
    const base = await setup(model);
    const fullExcerpt = `Bukchon Hanok Village is a residential neighborhood. ${"Visitor guidance. ".repeat(35)}`;
    const web = new WebSearchService({ search: async () => [
      { resultKey: "bukchon-info", name: "Bukchon", title: "Bukchon visitor information", url: "https://visitkorea.example/bukchon", publisher: "Visit Korea", excerpt: fullExcerpt },
      { resultKey: "bukchon-prices", name: "Bukchon admission", title: "Bukchon experience tickets", url: "https://bukchon.example/tickets", publisher: "Bukchon", excerpt: "Adults KRW 3,000; children KRW 1,500", amount: 3000, currency: "KRW" },
    ] }, { now: () => new Date("2026-10-29T00:00:00Z"), maxResults: 5, staleAfterDays: 180 });
    const agent = new TourAgentService(base.trips, base.planning, model, 20, 60, undefined, undefined, web, base.externalSources, 300_000);

    await agent.run(base.trip.id, { instruction: "Tra thông tin về Bukchon" });

    const result = model.inputs[1]?.toolResults?.find((entry) => entry.tool === "search_web")?.result as Array<Record<string, unknown>>;
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ title: "Bukchon visitor information", url: "https://visitkorea.example/bukchon", excerpt: fullExcerpt });
    expect(result[1]).toMatchObject({ title: "Bukchon experience tickets", excerpt: "Adults KRW 3,000; children KRW 1,500" });
    expect(result[1]).not.toHaveProperty("id");
  });

  it("does not impose a separate web-search limit while the agent run budget remains", async () => {
    let providerCalls = 0;
    const decisions: AgentDecision[] = Array.from({ length: 6 }, (_, index) => ({
      type: "tool_calls",
      calls: [{ name: "search_web", arguments: { query: `Seoul venue ${index + 1}` } }],
    }));
    decisions.push({ type: "final", text: "Không tìm được nguồn ngoài phù hợp." });
    const model = new ScriptedModel(decisions);
    const base = await setup(model);
    const web = new WebSearchService({
      search: async () => { providerCalls += 1; return []; },
    }, { now: () => new Date("2026-10-27T00:00:00Z"), maxResults: 5, staleAfterDays: 180 });
    const agent = new TourAgentService(base.trips, base.planning, model, 20, 60, undefined, undefined, web, base.externalSources, 300_000);

    await agent.run(base.trip.id, { instruction: "Lập lịch Seoul" });

    expect(providerCalls).toBe(6);
    expect(model.inputs[6]?.toolResults?.[5]?.result).toEqual([]);
  });
});



