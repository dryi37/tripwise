import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";

import { ApiError } from "../../shared/http/api-error.js";
import { agentLogger } from "../../shared/observability/agent-logger.js";
import type { PlanningService } from "../planning/planning.service.js";
import type { ItineraryDraft } from "../planning/planning.types.js";
import type { TripService } from "../trips/trip.service.js";
import type { Trip } from "../trips/trip.types.js";
import type { CatalogService } from "../catalog/catalog.service.js";
import type { KnowledgeService } from "../knowledge/knowledge.service.js";
import type { WebSearchService } from "../web-search/web-search.service.js";
import type { ExternalSourceService } from "../external-sources/external-source.service.js";
import type { AgentDecision, AgentModel, AgentModelInput } from "./agent-model.js";
import { addItineraryItemToolSchema, addPlaceFromExternalSourceToolSchema, addQuoteItemFromOfferToolSchema, searchKnowledgeToolSchema, searchSupplierOffersToolSchema, searchWebToolSchema } from "./tour-agent.schemas.js";
import type { RunTourAgentInput, TourAgentResult } from "./tour-agent.types.js";

const AgentState = Annotation.Root({
  tripId: Annotation<string>,
  runId: Annotation<string>,
  deadlineAt: Annotation<number>,
  tripDays: Annotation<number>,
  modelTurnLimit: Annotation<number>,
  toolCallLimit: Annotation<number>,
  instruction: Annotation<string>,
  trip: Annotation<Trip | null>,
  draft: Annotation<ItineraryDraft | null>,
  decision: Annotation<AgentDecision | null>,
  summary: Annotation<string>,
  modelTurns: Annotation<number>,
  toolsExecuted: Annotation<number>,
  webSearchCalls: Annotation<number>,
  toolResults: Annotation<AgentToolResult[]>,
  sources: Annotation<Array<{ documentId?: string; externalSourceId?: string; title: string; sourceLabel: string | null; url?: string }>>,
});

const placeStopWords = new Set(["tham", "quan", "thamquan", "cung", "dien", "khu", "cong", "vien", "song", "thu", "gian", "ngam", "canh", "tai", "diem", "du", "lich"]);

function placeTerms(value: string, destination: string): Set<string> {
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi").replace(/đ/g, "d");
  const destinationTerms = new Set(normalize(destination).split(/[^a-z0-9]+/).filter(Boolean));
  return new Set(normalize(value).split(/[^a-z0-9]+/).filter((term) => term.length >= 4 && !placeStopWords.has(term) && !destinationTerms.has(term)));
}

function sharesPlaceTerm(left: string, right: string, destination: string): boolean {
  const leftTerms = placeTerms(left, destination);
  return [...placeTerms(right, destination)].some((term) => leftTerms.has(term));
}

function explicitlyRequestsItinerary(instruction: string): boolean {
  const normalized = instruction.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi").replace(/đ/g, "d");
  const asksToCreate = /\b(tao|lap|xay dung|hoan thien|tiep tuc|create|build|plan|complete|finish|continue)\b/.test(normalized);
  const mentionsItinerary = /lich trinh|itinerary|tour|trip plan/.test(normalized);
  return asksToCreate && mentionsItinerary;
}

function normalizeAgentLocalTime(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return value;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3]?.toUpperCase();
  if (minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return value;
  if (meridiem) hour = (hour % 12) + (meridiem === "PM" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeAgentToolArguments(tool: string, value: unknown): unknown {
  if (tool !== "add_itinerary_item" || typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const arguments_ = value as Record<string, unknown>;
  const unpricedReason = typeof arguments_.unpricedReason === "string" ? arguments_.unpricedReason.trim() : arguments_.unpricedReason;
  return {
    ...arguments_,
    location: arguments_.location === null ? "" : arguments_.location,
    localStartTime: normalizeAgentLocalTime(arguments_.localStartTime),
    localEndTime: normalizeAgentLocalTime(arguments_.localEndTime),
    ...(typeof unpricedReason === "string" && unpricedReason.length > 240
      ? { unpricedReason: `${unpricedReason.slice(0, 237).trimEnd()}...` }
      : typeof unpricedReason === "string" ? { unpricedReason } : {}),
  };
}

type PlaceSearchActivity = { title: string; location: string };
type AgentToolResult = NonNullable<AgentModelInput["toolResults"]>[number];

function hasPlacePriceSearch(toolResults: AgentToolResult[], activity: PlaceSearchActivity, destination: string): boolean {
  return toolResults.some((entry) => (entry.tool === "search_web" || entry.tool === "search_supplier_offers")
    && typeof entry.query === "string"
    && sharesPlaceTerm(entry.query, `${activity.title} ${activity.location}`, destination));
}

function matchingSupplierOfferIds(toolResults: AgentToolResult[], activity: PlaceSearchActivity, destination: string): string[] {
  const ids: string[] = [];
  for (const entry of toolResults) {
    if (entry.tool !== "search_supplier_offers" || typeof entry.query !== "string"
      || !sharesPlaceTerm(entry.query, `${activity.title} ${activity.location}`, destination)) continue;
    const services = Array.isArray(entry.result) ? entry.result : [];
    for (const value of services) {
      if (!value || typeof value !== "object") continue;
      const service = value as { name?: unknown; offers?: unknown };
      if (typeof service.name !== "string" || !sharesPlaceTerm(service.name, `${activity.title} ${activity.location}`, destination) || !Array.isArray(service.offers)) continue;
      for (const offer of service.offers) {
        if (offer && typeof offer === "object" && typeof (offer as { id?: unknown; status?: unknown }).id === "string"
          && (offer as { status?: unknown }).status === "VERIFIED") ids.push((offer as { id: string }).id);
      }
    }
  }
  return ids;
}

function matchingExternalSourceIds(toolResults: AgentToolResult[], activity: PlaceSearchActivity, destination: string): string[] {
  const ids: string[] = [];
  for (const entry of toolResults) {
    if (entry.tool !== "search_web" || typeof entry.query !== "string"
      || !sharesPlaceTerm(entry.query, `${activity.title} ${activity.location}`, destination) || !Array.isArray(entry.result)) continue;
    for (const value of entry.result) {
      if (!value || typeof value !== "object") continue;
      const source = value as { id?: unknown; placeName?: unknown; suitable?: unknown; confidence?: unknown };
      if (typeof source.id === "string" && typeof source.placeName === "string"
        && sharesPlaceTerm(source.placeName, `${activity.title} ${activity.location}`, destination)
        && source.suitable === true && typeof source.confidence === "number" && source.confidence >= 0.7) ids.push(source.id);
    }
  }
  return ids;
}

function canonicalSearchedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isSearchedWebUrl(toolResults: AgentToolResult[], activity: PlaceSearchActivity, destination: string, sourceUrl: string): boolean {
  const canonicalUrl = canonicalSearchedUrl(sourceUrl);
  if (!canonicalUrl) return false;
  return toolResults.some((entry) => entry.tool === "search_web" && typeof entry.query === "string"
    && sharesPlaceTerm(entry.query, `${activity.title} ${activity.location}`, destination)
    && Array.isArray(entry.result)
    && entry.result.some((value: unknown) => value && typeof value === "object"
      && typeof (value as { url?: unknown }).url === "string"
      && canonicalSearchedUrl((value as { url: string }).url) === canonicalUrl));
}

export class TourAgentService {
  private readonly graph;
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly trips: TripService,
    private readonly planning: PlanningService,
    private readonly model: AgentModel,
    private readonly modelCallsPerDay: number,
    private readonly toolCallsPerDay: number,
    private readonly catalog?: CatalogService,
    private readonly knowledge?: KnowledgeService,
    private readonly webSearch?: WebSearchService,
    private readonly externalSources?: ExternalSourceService,
    requestTimeoutMs?: number,
  ) {
    if (!Number.isSafeInteger(requestTimeoutMs) || !requestTimeoutMs || requestTimeoutMs < 1) throw new Error("Agent run timeout must be configured");
    this.requestTimeoutMs = requestTimeoutMs;
    this.graph = new StateGraph(AgentState)
      .addNode("model", async (state) => this.runModel(state))
      .addNode("tools", async (state) => this.runTools(state))
      .addNode("limit", (state) => {
        agentLogger.warn({ event: "tour_agent.model_budget.exhausted", runId: state.runId, tripId: state.tripId, tripDays: state.tripDays, modelTurns: state.modelTurns, modelTurnLimit: state.modelTurnLimit, toolsExecuted: state.toolsExecuted, toolCallLimit: state.toolCallLimit });
        throw new ApiError(503, "AGENT_ITERATION_LIMIT", "The agent did not finish within the allowed model calls per trip day", { tripDays: state.tripDays, modelTurns: state.modelTurns, modelTurnLimit: state.modelTurnLimit, toolsExecuted: state.toolsExecuted, toolCallLimit: state.toolCallLimit });
      })
      .addEdge(START, "model")
      .addConditionalEdges("model", (state) => {
        if (state.decision?.type === "final") return END;
        return state.modelTurns >= state.modelTurnLimit ? "limit" : "tools";
      })
      .addEdge("tools", "model")
      .addEdge("limit", END)
      .compile();
  }

  async run(tripId: string, input: RunTourAgentInput, correlationId: string = randomUUID()): Promise<TourAgentResult> {
    const runId = correlationId;
    const startedAt = Date.now();
    let deadlineAt = 0;
    let requestTimeoutMs = this.requestTimeoutMs;
    let tripDays = 0;
    let modelTurnLimit = 0;
    let toolCallLimit = 0;
    try {
      const trip = await this.trips.get(tripId);
      tripDays = Math.max(1, Math.floor((Date.parse(`${trip.endDate}T00:00:00Z`) - Date.parse(`${trip.startDate}T00:00:00Z`)) / 86_400_000) + 1);
      requestTimeoutMs = this.requestTimeoutMs * tripDays;
      deadlineAt = Date.now() + requestTimeoutMs;
      modelTurnLimit = this.modelCallsPerDay * tripDays;
      toolCallLimit = this.toolCallsPerDay * tripDays;
      agentLogger.info({ event: "tour_agent.run.started", runId, tripId, entryPoint: "chat_endpoint", timeoutMs: requestTimeoutMs, timeoutPerDayMs: this.requestTimeoutMs, tripDays, modelCallsPerDay: this.modelCallsPerDay, modelTurnLimit, toolCallsPerDay: this.toolCallsPerDay, toolCallLimit });
      const result = await this.graph.invoke({
        tripId,
        runId,
        deadlineAt,
        tripDays,
        modelTurnLimit,
        toolCallLimit,
        instruction: input.instruction,
        trip,
        draft: null,
        decision: null,
        summary: "",
        modelTurns: 0,
        toolsExecuted: 0,
        webSearchCalls: 0,
        toolResults: [],
        sources: [],
      }, { recursionLimit: modelTurnLimit * 2 + 1 });
      if (Date.now() >= deadlineAt) throw this.timeoutError();
      if (!result.draft || !result.summary) {
        throw new ApiError(500, "AGENT_INVALID_RESULT", "The agent returned an incomplete result");
      }
      const warnings = result.toolResults.flatMap((entry) => {
        if (entry.tool !== "add_itinerary_item" || !entry.result || typeof entry.result !== "object") return [];
        const saved = entry.result as { applied?: unknown; title?: unknown; unpricedReason?: unknown };
        if (saved.applied !== true || typeof saved.unpricedReason !== "string") return [];
        return [`${typeof saved.title === "string" ? saved.title : "Hoạt động"}: chưa có giá được xác minh. ${saved.unpricedReason}`];
      });
      const summary = warnings.length ? `${result.summary}\n\nLưu ý giá:\n${warnings.map((warning) => `- ${warning}`).join("\n")}` : result.summary;
      agentLogger.info({
        event: "tour_agent.run.completed",
        runId,
        tripId,
        durationMs: Date.now() - startedAt,
        tripDays,
        modelTurns: result.modelTurns,
        modelTurnLimit,
        toolsExecuted: result.toolsExecuted,
        toolCallLimit,
        activityCount: result.draft.items.length,
        sourceCount: result.sources.length,
      });
      return {
        summary,
        modelTurns: result.modelTurns,
        toolsExecuted: result.toolsExecuted,
        draft: result.draft,
        sources: result.sources,
        warnings,
      };
    } catch (error) {
      agentLogger.error({
        event: "tour_agent.run.failed",
        runId,
        tripId,
        durationMs: Date.now() - startedAt,
        tripDays: tripDays || undefined,
        modelTurnLimit: modelTurnLimit || undefined,
        toolCallLimit: toolCallLimit || undefined,
        errorCode: error instanceof ApiError ? error.code : error instanceof Error ? error.name : "UNKNOWN_ERROR",
        status: error instanceof ApiError ? error.status : undefined,
      });
      throw error;
    }
  }

  private async runModel(state: typeof AgentState.State): Promise<Partial<typeof AgentState.State>> {
    const trip = state.trip ?? await this.trips.get(state.tripId);
    const draft = await this.planning.getDraft(state.tripId);
    const timeoutMs = state.deadlineAt - Date.now();
    if (timeoutMs <= 0) throw this.timeoutError();
    const signal = AbortSignal.timeout(timeoutMs);
    const turn = state.modelTurns + 1;
    const modelStartedAt = Date.now();
    agentLogger.info({ event: "tour_agent.model.started", runId: state.runId, tripId: state.tripId, turn, modelTurnLimit: state.modelTurnLimit, tripDays: state.tripDays, timeoutMs });
    let decision: AgentDecision;
    try {
      decision = await this.model.decide({
        instruction: state.instruction,
        trip,
        draft,
        turn,
        budget: { tripDays: state.tripDays, modelTurnLimit: state.modelTurnLimit, toolCallLimit: state.toolCallLimit, toolsExecuted: state.toolsExecuted },
        toolResults: state.toolResults,
      }, { runId: state.runId, signal });
      if (Date.now() >= state.deadlineAt) throw this.timeoutError();
    } catch (error) {
      const timedOut = signal.aborted || Date.now() >= state.deadlineAt || (error instanceof ApiError && error.code === "AGENT_TIMEOUT");
      agentLogger.error({
        event: timedOut ? "tour_agent.model.timed_out" : "tour_agent.model.failed",
        runId: state.runId,
        tripId: state.tripId,
        turn,
        durationMs: Date.now() - modelStartedAt,
        errorCode: timedOut ? "AGENT_TIMEOUT" : error instanceof ApiError ? error.code : error instanceof Error ? error.name : "UNKNOWN_ERROR",
      });
      if (timedOut) throw this.timeoutError();
      throw error;
    }
    let toolResults = state.toolResults;
    const missingDayIndices = Array.from({ length: state.tripDays }, (_, index) => index + 1)
      .filter((dayIndex) => !draft.items.some((item) => item.dayIndex === dayIndex));
    if (decision.type === "final" && missingDayIndices.length > 0 && explicitlyRequestsItinerary(state.instruction)) {
      const reason = draft.items.length === 0 ? "ITINERARY_REQUIRED" : "ITINERARY_DAYS_INCOMPLETE";
      agentLogger.warn({ event: "tour_agent.final.blocked", runId: state.runId, tripId: state.tripId, turn, reason, missingDayIndices });
      decision = { type: "tool_calls", calls: [] };
      toolResults = [...state.toolResults, {
        tool: "itinerary_completion_required",
        result: {
          applied: false,
          reason,
          missingDayIndices,
          message: `Add at least one researched or clearly marked unpriced activity for each missing trip day before returning a final response. Missing days: ${missingDayIndices.join(", ")}.`,
        },
      }];
    }
    agentLogger.info({ event: "tour_agent.model.completed", runId: state.runId, tripId: state.tripId, turn, modelTurnLimit: state.modelTurnLimit, tripDays: state.tripDays, durationMs: Date.now() - modelStartedAt, decisionType: decision.type, toolCallCount: decision.type === "tool_calls" ? decision.calls.length : 0 });
    return {
      trip,
      draft,
      decision,
      toolResults,
      modelTurns: state.modelTurns + 1,
      ...(decision.type === "final" ? { summary: decision.text } : {}),
    };
  }

  private async runTools(state: typeof AgentState.State): Promise<Partial<typeof AgentState.State>> {
    if (state.decision?.type !== "tool_calls") {
      throw new ApiError(500, "AGENT_INVALID_STATE", "Agent tool node received no tool calls");
    }
    if (state.decision.calls.length > 20) {
      throw new ApiError(422, "AGENT_TOOL_REJECTED", "The agent requested too many tools in one turn");
    }
    if (state.toolsExecuted + state.decision.calls.length > state.toolCallLimit) {
      agentLogger.warn({ event: "tour_agent.tool_budget.exhausted", runId: state.runId, tripId: state.tripId, tripDays: state.tripDays, turn: state.modelTurns, toolsExecuted: state.toolsExecuted, requestedToolCalls: state.decision.calls.length, toolCallLimit: state.toolCallLimit });
      throw new ApiError(503, "AGENT_TOOL_LIMIT", "The agent reached the allowed tool calls per trip day", { tripDays: state.tripDays, toolsExecuted: state.toolsExecuted, requestedToolCalls: state.decision.calls.length, toolCallLimit: state.toolCallLimit });
    }
    const parsedCalls = state.decision.calls.map((call) => {
      const schema = call.name === "add_itinerary_item" ? addItineraryItemToolSchema : call.name === "search_knowledge" ? searchKnowledgeToolSchema : call.name === "search_supplier_offers" ? searchSupplierOffersToolSchema : call.name === "add_quote_item_from_offer" ? addQuoteItemFromOfferToolSchema : call.name === "search_web" ? searchWebToolSchema : call.name === "add_place_from_external_source" ? addPlaceFromExternalSourceToolSchema : null;
      if (!schema) throw new ApiError(422, "AGENT_TOOL_REJECTED", `Tool '${call.name}' is not allowed`);
      const parsed = schema.safeParse(normalizeAgentToolArguments(call.name, call.arguments));
      return parsed.success
        ? { name: call.name, data: parsed.data, validationError: null }
        : { name: call.name, data: null, validationError: parsed.error.flatten() };
    });
    const invalidCalls = parsedCalls.filter((call) => call.validationError !== null);
    if (invalidCalls.length > 0) {
      const invalidFields = [...new Set(invalidCalls.flatMap((call) => Object.keys(call.validationError!.fieldErrors)))];
      const invalidByIndex = new Map(parsedCalls.map((call, index) => [index, call.validationError]));
      const validationResults = state.decision.calls.map((call, index) => {
        const validationError = invalidByIndex.get(index);
        const fields = validationError ? Object.keys(validationError.fieldErrors) : [];
        return {
          tool: call.name,
          result: validationError
            ? { applied: false, reason: "INVALID_TOOL_ARGUMENTS", fields, message: `Correct the invalid fields (${fields.join(", ")}) using the tool schema, then resubmit the complete batch. Times must use HH:mm; unpricedReason must be at most 240 characters.` }
            : { applied: false, reason: "TOOL_BATCH_REJECTED", message: "No tool in this batch ran because another tool call had invalid arguments. Resubmit the complete batch after correcting it." },
        };
      });
      agentLogger.warn({ event: "tour_agent.tool.arguments_rejected", runId: state.runId, tripId: state.tripId, turn: state.modelTurns, invalidCallCount: invalidCalls.length, rejectedBatchCount: state.decision.calls.length, invalidFields });
      return {
        draft: state.draft ?? await this.planning.getDraft(state.tripId),
        decision: null,
        toolsExecuted: state.toolsExecuted + state.decision.calls.length,
        webSearchCalls: state.webSearchCalls,
        toolResults: [...state.toolResults, ...validationResults],
        sources: state.sources,
      };
    }
    const calls = parsedCalls.map((call) => ({ name: call.name, data: call.data! }));
    let draft = state.draft ?? await this.planning.getDraft(state.tripId);
    const toolResults = [...state.toolResults];
    const sources = [...state.sources];
    let webSearchCalls = state.webSearchCalls;
    for (const [index, call] of calls.entries()) {
      if (Date.now() >= state.deadlineAt) throw this.timeoutError();
      const toolStartedAt = Date.now();
      let resultCount: number | undefined;
      agentLogger.info({ event: "tour_agent.tool.started", runId: state.runId, tripId: state.tripId, turn: state.modelTurns, tool: call.name, toolIndex: index + 1, toolCallNumber: state.toolsExecuted + index + 1, toolCallLimit: state.toolCallLimit, tripDays: state.tripDays });
      try {
        if (call.name === "add_itinerary_item") {
          const input = call.data as ReturnType<typeof addItineraryItemToolSchema.parse>;
          const { supplierOfferId, sourceUrl, quantity: requestedQuantity, unit, unpricedReason, ...activity } = input;
          const place = { title: activity.title, location: activity.location };
          const hasResearchWithoutMatchingPrice = toolResults.some((entry) => entry.tool === "search_supplier_offers" || entry.tool === "search_web");
          const hasMatchingSourceUrl = sourceUrl ? isSearchedWebUrl(toolResults, place, state.trip!.destination, sourceUrl) : false;
          if (sourceUrl && !hasMatchingSourceUrl) {
            toolResults.push({ tool: call.name, result: { applied: false, reason: "SOURCE_URL_NOT_FROM_PLACE_SEARCH", message: "Use the exact external URL returned by search_web for this place." } });
            continue;
          }
          if (sourceUrl && !unpricedReason) {
            toolResults.push({ tool: call.name, result: { applied: false, reason: "UNPRICED_REASON_REQUIRED", message: "Include a short reason because this external URL has no server-issued price source ID." } });
            continue;
          }
          if (!supplierOfferId && !sourceUrl && !hasPlacePriceSearch(toolResults, place, state.trip!.destination) && (!unpricedReason || !hasResearchWithoutMatchingPrice)) {
            toolResults.push({ tool: call.name, result: { applied: false, reason: "PLACE_PRICE_SEARCH_REQUIRED", message: "Search this exact place in internal offers or public sources for its price and trip-date suitability before saving the activity." } });
            agentLogger.warn({ event: "tour_agent.activity.blocked", runId: state.runId, tripId: state.tripId, turn: state.modelTurns, reason: "PLACE_PRICE_SEARCH_REQUIRED" });
            continue;
          }
          if (supplierOfferId && !matchingSupplierOfferIds(toolResults, place, state.trip!.destination).includes(supplierOfferId)) {
            toolResults.push({ tool: call.name, result: { applied: false, reason: "SUPPLIER_OFFER_NOT_FROM_PLACE_SEARCH", message: "Use only a matching supplierOfferId returned by the place-specific supplier search." } });
            agentLogger.warn({ event: "tour_agent.activity.blocked", runId: state.runId, tripId: state.tripId, turn: state.modelTurns, reason: "SUPPLIER_OFFER_NOT_FROM_PLACE_SEARCH" });
            continue;
          }
          if (!supplierOfferId && !sourceUrl) {
            const offerIds = matchingSupplierOfferIds(toolResults, place, state.trip!.destination);
            const externalSourceIds = matchingExternalSourceIds(toolResults, place, state.trip!.destination);
            if (offerIds.length || externalSourceIds.length) {
              toolResults.push({ tool: call.name, result: { applied: false, reason: "MATCHING_PRICE_SOURCE_AVAILABLE", supplierOfferIds: offerIds, externalSourceIds, message: "A matching priced source was found. Link that exact internal offer with supplierOfferId or add the exact public source using add_place_from_external_source before adding this activity without a price." } });
              continue;
            }
            if (!unpricedReason) {
              toolResults.push({ tool: call.name, result: { applied: false, reason: "UNPRICED_REASON_REQUIRED", message: "No matching price source was found. Retry with a concise unpricedReason and present this as an unverified suggestion." } });
              continue;
            }
          }
          let quantity = requestedQuantity ?? 1;
          if (supplierOfferId) {
            if (!this.catalog) throw new ApiError(503, "CATALOG_NOT_CONFIGURED", "Catalog search is not configured");
            const offer = await this.catalog.getOfferForQuote(supplierOfferId);
            if (offer.currency !== state.trip!.budgetCurrency) {
              throw new ApiError(422, "OFFER_NOT_SELECTABLE", "Linked offer must be verified, active, currency-matched, and valid for the trip date");
            }
            if (requestedQuantity === undefined) {
              const offerUnit = offer.service.unit.toLocaleLowerCase("vi");
              quantity = /vé|ticket|person|người|khách/.test(offerUnit) ? state.trip!.travelers
                : /đêm|night/.test(offerUnit) ? Math.max(1, Math.round((Date.parse(`${state.trip!.endDate}T00:00:00Z`) - Date.parse(`${state.trip!.startDate}T00:00:00Z`)) / 86_400_000))
                  : 1;
            }
          }
          const result = await this.planning.addConsultantItineraryItem(state.tripId, {
            ...activity,
            expectedRevision: draft.revision,
            quantity,
            ...(unit ? { unit } : {}),
            ...(sourceUrl ? { sourceUrl } : {}),
            ...(supplierOfferId ? { supplierOfferId } : {}),
            ...(unpricedReason ? { unpricedReason } : {}),
          });
          draft = result.draft;
          const savedActivity = draft.items.find((item) => item.title === activity.title && item.dayIndex === activity.dayIndex && item.localStartTime === activity.localStartTime);
          toolResults.push({ tool: call.name, result: { applied: true, title: activity.title, activityId: savedActivity?.id, revision: draft.revision, quoteRevision: result.quote.revision, ...(sourceUrl ? { sourceUrl } : {}), ...(unpricedReason ? { unpricedReason } : {}) } });
        } else if (call.name === "search_knowledge") {
          if (!this.knowledge) throw new ApiError(503, "KNOWLEDGE_NOT_CONFIGURED", "Knowledge search is not configured");
          const input = call.data as ReturnType<typeof searchKnowledgeToolSchema.parse>;
          const results = await this.knowledge.search(input.query);
          resultCount = results.length;
          toolResults.push({ tool: call.name, result: results });
          for (const result of results) if (!sources.some((source) => source.documentId === result.documentId)) sources.push({ documentId: result.documentId, title: result.title, sourceLabel: result.sourceLabel });
        } else if (call.name === "search_supplier_offers") {
          if (!this.catalog) throw new ApiError(503, "CATALOG_NOT_CONFIGURED", "Catalog search is not configured");
          const input = call.data as ReturnType<typeof searchSupplierOffersToolSchema.parse>;
          let results = await this.catalog.searchForAgent({ query: input.query, ...(input.category ? { category: input.category } : {}) });
          if (results.length === 0 && input.query.trim().toLocaleLowerCase() !== state.trip!.destination.toLocaleLowerCase()) {
            results = await this.catalog.searchForAgent({ query: state.trip!.destination });
            agentLogger.info({ event: "tour_agent.catalog.destination_fallback", runId: state.runId, tripId: state.tripId, turn: state.modelTurns, resultCount: results.length });
          }
          resultCount = results.length;
          toolResults.push({ tool: call.name, query: input.query, result: results });
        } else if (call.name === "add_quote_item_from_offer") {
          const input = call.data as ReturnType<typeof addQuoteItemFromOfferToolSchema.parse>;
          let quote = await this.planning.getQuote(state.tripId);
          if (!quote.items.some((item) => item.supplierOfferId === input.supplierOfferId)) quote = await this.planning.addQuoteItemFromOffer(state.tripId, { ...input, expectedRevision: quote.revision });
          toolResults.push({ tool: call.name, result: { applied: true, quoteRevision: quote.revision } });
        } else if (call.name === "search_web") {
          if (!this.webSearch || !this.externalSources) throw new ApiError(503, "WEB_SEARCH_NOT_CONFIGURED", "Web search is not configured");
          const input = call.data as ReturnType<typeof searchWebToolSchema.parse>;
          webSearchCalls += 1;
          const searchResults = await this.webSearch.searchForAgent({ query: input.query, destination: state.trip!.destination, startDate: state.trip!.startDate, endDate: state.trip!.endDate, adultCount: state.trip!.adultCount, childCount: state.trip!.childCount });
          const persisted = await this.externalSources.persistSearchResults(state.tripId, searchResults.priceCandidates);
          const sourcesByResultKey = new Map(persisted.map((source) => [source.resultKey, source]));
          const resultsForAgent = searchResults.results.map((result) => {
            const source = sourcesByResultKey.get(result.resultKey);
            return source ? {
              ...result,
              id: source.id,
              placeName: source.placeName,
              domain: source.domain,
              canonicalUrl: source.canonicalUrl,
              originalAmountMinor: source.originalAmountMinor,
              originalCurrency: source.originalCurrency,
              pricingUnit: source.pricingUnit,
              audience: source.audience,
              suitable: source.suitable,
              confidence: source.confidence,
              verificationStatus: source.verificationStatus,
              evidence: source.evidence,
            } : result;
          });
          resultCount = resultsForAgent.length;
          toolResults.push({ tool: call.name, query: input.query, result: resultsForAgent });
          for (const source of persisted) if (!sources.some((item) => item.externalSourceId === source.id)) sources.push({ externalSourceId: source.id, title: source.title, sourceLabel: source.publisher, url: source.canonicalUrl });
        } else {
          const input = call.data as ReturnType<typeof addPlaceFromExternalSourceToolSchema.parse>;
          const searchedResult = toolResults.flatMap((entry) => entry.tool === "search_web" && Array.isArray(entry.result) ? entry.result : [])
            .find((source: unknown) => source && typeof source === "object" && (source as { id?: unknown }).id === input.externalSourceId) as { placeName?: unknown; name?: unknown } | undefined;
          const placeName = typeof searchedResult?.placeName === "string" ? searchedResult.placeName : typeof searchedResult?.name === "string" ? searchedResult.name : "Địa điểm từ nguồn web";
          const place = { title: placeName, location: placeName };
          if (!searchedResult || !matchingExternalSourceIds(toolResults, place, state.trip!.destination).includes(input.externalSourceId)) {
            toolResults.push({ tool: call.name, result: { applied: false, reason: "EXTERNAL_SOURCE_NOT_FROM_PLACE_SEARCH", message: "Search the exact place first, then select its suitable returned externalSourceId." } });
            continue;
          }
          const result = await this.planning.addConsultantItineraryItem(state.tripId, {
            dayIndex: input.dayIndex,
            title: placeName,
            location: placeName,
            localStartTime: input.localStartTime,
            localEndTime: input.localEndTime,
            timezone: input.timezone,
            description: `Tham quan ${placeName}. Giá và thông tin được lưu cùng nguồn web để tư vấn viên kiểm tra.`,
            externalSourceId: input.externalSourceId,
            quantity: input.quantity,
            expectedRevision: draft.revision,
          });
          draft = result.draft;
          toolResults.push({ tool: call.name, result: { applied: true, draftRevision: result.draft.revision, quoteRevision: result.quote.revision } });
        }
        if (Date.now() >= state.deadlineAt) throw this.timeoutError();
      } catch (error) {
        if (error instanceof ApiError && error.code === "ACTIVITY_TIME_CONFLICT") {
          const details = error.details as { conflictingTitle?: string } | undefined;
          const message = details?.conflictingTitle ? `Khung giờ bị trùng với hoạt động “${details.conflictingTitle}”. Hãy chọn giờ khác.` : "Khung giờ bị trùng với một hoạt động khác. Hãy chọn giờ khác.";
          toolResults.push({ tool: call.name, result: { applied: false, reason: error.code, message } });
          agentLogger.warn({ event: "tour_agent.activity.blocked", runId: state.runId, tripId: state.tripId, turn: state.modelTurns, reason: error.code });
          continue;
        }
        agentLogger.error({
          event: "tour_agent.tool.failed",
          runId: state.runId,
          tripId: state.tripId,
          turn: state.modelTurns,
          tool: call.name,
          toolCallNumber: state.toolsExecuted + index + 1,
          toolCallLimit: state.toolCallLimit,
          tripDays: state.tripDays,
          durationMs: Date.now() - toolStartedAt,
          errorCode: error instanceof ApiError ? error.code : error instanceof Error ? error.name : "UNKNOWN_ERROR",
        });
        throw error;
      }
      agentLogger.info({ event: "tour_agent.tool.completed", runId: state.runId, tripId: state.tripId, turn: state.modelTurns, tool: call.name, toolCallNumber: state.toolsExecuted + index + 1, toolCallLimit: state.toolCallLimit, tripDays: state.tripDays, durationMs: Date.now() - toolStartedAt, ...(resultCount === undefined ? {} : { resultCount }) });
    }
    return {
      draft,
      decision: null,
      toolsExecuted: state.toolsExecuted + state.decision.calls.length,
      webSearchCalls,
      toolResults,
      sources,
    };
  }

  private timeoutError(): ApiError {
    return new ApiError(504, "AGENT_TIMEOUT", "The agent exceeded its configured run timeout");
  }
}
