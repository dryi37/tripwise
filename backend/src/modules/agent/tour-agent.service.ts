import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";

import { ApiError } from "../../shared/http/api-error.js";
import { agentLogger } from "../../shared/observability/agent-logger.js";
import { majorAmountToMinor } from "../currency/exchange-rate.provider.js";
import type { PlanningService } from "../planning/planning.service.js";
import type { ItineraryDraft } from "../planning/planning.types.js";
import type { TripService } from "../trips/trip.service.js";
import type { Trip } from "../trips/trip.types.js";
import type { CatalogService } from "../catalog/catalog.service.js";
import type { KnowledgeService } from "../knowledge/knowledge.service.js";
import type { WebSearchService } from "../web-search/web-search.service.js";
import type { ExternalSourceService } from "../external-sources/external-source.service.js";
import type { PlacesService } from "../places/places.service.js";
import type { AgentContextSummary, AgentDecision, AgentHistoryEntry, AgentModel, AgentModelInput } from "./agent-model.js";
import { addItineraryItemToolSchema, searchKnowledgeToolSchema, searchPlacesToolSchema, searchSupplierOffersToolSchema, searchWebToolSchema } from "./tour-agent.schemas.js";
import type { RunTourAgentInput, TourAgentResult } from "./tour-agent.types.js";

const AgentState = Annotation.Root({
  tripId: Annotation<string>,
  runId: Annotation<string>,
  deadlineAt: Annotation<number>,
  tripDays: Annotation<number>,
  modelTurnLimit: Annotation<number>,
  normalModelTurnLimit: Annotation<number>,
  toolCallLimit: Annotation<number>,
  normalToolCallLimit: Annotation<number>,
  completionFallbackModelTurnLimit: Annotation<number>,
  completionFallbackModelTurns: Annotation<number>,
  completionFallbackToolCallLimit: Annotation<number>,
  completionFallbackToolsExecuted: Annotation<number>,
  completionFallbackPhase: Annotation<"NONE" | "AWAITING_MODEL" | "AWAITING_TOOLS" | "FINALIZE">,
  instruction: Annotation<string>,
  trip: Annotation<Trip | null>,
  draft: Annotation<ItineraryDraft | null>,
  decision: Annotation<AgentDecision | null>,
  summary: Annotation<string>,
  contextSummary: Annotation<AgentContextSummary | null>,
  modelTurns: Annotation<number>,
  toolsExecuted: Annotation<number>,
  webSearchCalls: Annotation<number>,
  toolResults: Annotation<AgentToolResult[]>,
  history: Annotation<AgentHistoryEntry[]>,
  sources: Annotation<Array<{ documentId?: string; externalSourceId?: string; title: string; sourceLabel: string | null; url?: string }>>,
});

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
    localStartTime: normalizeAgentLocalTime(arguments_.localStartTime),
    localEndTime: normalizeAgentLocalTime(arguments_.localEndTime),
    ...(typeof unpricedReason === "string" && unpricedReason.length > 240
      ? { unpricedReason: `${unpricedReason.slice(0, 237).trimEnd()}...` }
      : typeof unpricedReason === "string" ? { unpricedReason } : {}),
  };
}

type AgentToolResult = NonNullable<AgentModelInput["toolResults"]>[number];

function searchedSupplierOfferIds(toolResults: AgentToolResult[]): string[] {
  const ids: string[] = [];
  for (const entry of toolResults) {
    if (entry.tool !== "search_supplier_offers") continue;
    const services = Array.isArray(entry.result) ? entry.result : [];
    for (const value of services) {
      if (!value || typeof value !== "object") continue;
      const service = value as { name?: unknown; offers?: unknown };
      if (!Array.isArray(service.offers)) continue;
      for (const offer of service.offers) {
        if (offer && typeof offer === "object" && typeof (offer as { id?: unknown; status?: unknown }).id === "string"
          && (offer as { status?: unknown }).status === "VERIFIED") ids.push((offer as { id: string }).id);
      }
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

function isSearchedWebUrl(toolResults: AgentToolResult[], sourceUrl: string): boolean {
  const canonicalUrl = canonicalSearchedUrl(sourceUrl);
  if (!canonicalUrl) return false;
  return toolResults.some((entry) => entry.tool === "search_web" && Array.isArray(entry.result)
    && entry.result.some((value: unknown) => value && typeof value === "object"
      && typeof (value as { url?: unknown }).url === "string"
      && canonicalSearchedUrl((value as { url: string }).url) === canonicalUrl));
}

function matchingUnpricedConfirmation(toolResults: AgentToolResult[], activity: { dayIndex: number; title: string; placeId: string }): { id: string; matches: boolean } | undefined {
  for (const entry of [...toolResults].reverse()) {
    if (entry.tool !== "add_itinerary_item" || !entry.result || typeof entry.result !== "object") continue;
    const result = entry.result as Record<string, unknown>;
    if (result.reason !== "PRICE_RESEARCH_CONFIRMATION_REQUIRED" || result.dayIndex !== activity.dayIndex
      || result.title !== activity.title || result.placeId !== activity.placeId || typeof result.confirmationId !== "string") continue;
    return { id: result.confirmationId, matches: true };
  }
  return undefined;
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
    private readonly places?: PlacesService,
  ) {
    if (!Number.isSafeInteger(requestTimeoutMs) || !requestTimeoutMs || requestTimeoutMs < 1) throw new Error("Agent run timeout must be configured");
    this.requestTimeoutMs = requestTimeoutMs;
    this.graph = new StateGraph(AgentState)
      .addNode("context-summary", async (state) => this.summarizeContext(state))
      .addNode("model", async (state) => this.runModel(state))
      .addNode("tools", async (state) => this.runTools(state))
      .addNode("completion-fallback-finalize", async (state) => this.finalizeCompletionFallback(state))
      .addNode("limit", (state) => {
        agentLogger.warn({ event: "tour_agent.model_budget.exhausted", runId: state.runId, tripId: state.tripId, tripDays: state.tripDays, modelTurns: state.modelTurns, modelTurnLimit: state.modelTurnLimit, toolsExecuted: state.toolsExecuted, toolCallLimit: state.toolCallLimit });
        throw new ApiError(503, "AGENT_ITERATION_LIMIT", "The agent did not finish within the allowed model calls per trip day", { tripDays: state.tripDays, modelTurns: state.modelTurns, modelTurnLimit: state.modelTurnLimit, toolsExecuted: state.toolsExecuted, toolCallLimit: state.toolCallLimit });
      })
      .addEdge(START, "context-summary")
      .addEdge("context-summary", "model")
      .addConditionalEdges("model", (state) => {
        if (state.completionFallbackPhase === "FINALIZE") return "completion-fallback-finalize";
        if (state.decision?.type === "final") return END;
        if (state.completionFallbackPhase !== "NONE") return "tools";
        return state.modelTurns >= state.normalModelTurnLimit ? "limit" : "tools";
      })
      .addConditionalEdges("tools", (state) => state.completionFallbackPhase === "FINALIZE" ? "completion-fallback-finalize" : "context-summary")
      .addEdge("completion-fallback-finalize", END)
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
    let normalModelTurnLimit = 0;
    let normalToolCallLimit = 0;
    let completionFallbackToolCallLimit = 0;
    try {
      const trip = await this.trips.get(tripId);
      tripDays = Math.max(1, Math.floor((Date.parse(`${trip.endDate}T00:00:00Z`) - Date.parse(`${trip.startDate}T00:00:00Z`)) / 86_400_000) + 1);
      requestTimeoutMs = this.requestTimeoutMs * tripDays;
      deadlineAt = Date.now() + requestTimeoutMs;
      modelTurnLimit = this.modelCallsPerDay * tripDays;
      normalModelTurnLimit = modelTurnLimit;
      normalToolCallLimit = this.toolCallsPerDay * tripDays;
      completionFallbackToolCallLimit = this.toolCallsPerDay;
      toolCallLimit = normalToolCallLimit + completionFallbackToolCallLimit;
      agentLogger.info({ event: "tour_agent.run.started", runId, tripId, entryPoint: "chat_endpoint", timeoutMs: requestTimeoutMs, timeoutPerDayMs: this.requestTimeoutMs, tripDays, modelCallsPerDay: this.modelCallsPerDay, modelTurnLimit, completionFallbackModelTurnLimit: this.modelCallsPerDay, toolCallsPerDay: this.toolCallsPerDay, toolCallLimit, completionFallbackToolCallLimit });
      const result = await this.graph.invoke({
        tripId,
        runId,
        deadlineAt,
        tripDays,
        modelTurnLimit,
        normalModelTurnLimit,
        toolCallLimit,
        normalToolCallLimit,
        completionFallbackModelTurnLimit: this.modelCallsPerDay,
        completionFallbackModelTurns: 0,
        completionFallbackToolCallLimit,
        completionFallbackToolsExecuted: 0,
        completionFallbackPhase: "NONE",
        instruction: input.instruction,
        trip,
        draft: null,
        decision: null,
        summary: "",
        contextSummary: null,
        modelTurns: 0,
        toolsExecuted: 0,
        webSearchCalls: 0,
        toolResults: [],
        history: [],
        sources: [],
      }, { recursionLimit: modelTurnLimit * 6 + 10 });
      if (Date.now() >= deadlineAt) throw this.timeoutError();
      if (!result.draft || !result.summary) {
        throw new ApiError(500, "AGENT_INVALID_RESULT", "The agent returned an incomplete result");
      }
      const warnings = result.toolResults.flatMap((entry) => {
        if (entry.tool === "itinerary_completion_finalized" && entry.result && typeof entry.result === "object") {
          const finalized = entry.result as { missingDayIndices?: unknown };
          if (Array.isArray(finalized.missingDayIndices) && finalized.missingDayIndices.length > 0) {
            return [`Lịch trình chưa hoàn tất: còn thiếu hoạt động cho ngày ${finalized.missingDayIndices.join(", ")}.`];
          }
        }
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

  private async summarizeContext(state: typeof AgentState.State): Promise<Partial<typeof AgentState.State>> {
    if (state.completionFallbackPhase !== "NONE" || !this.model.summarizeContext) return {};
    const timeoutMs = state.deadlineAt - Date.now();
    if (timeoutMs <= 0) throw this.timeoutError();
    const trip = state.trip ?? await this.trips.get(state.tripId);
    const draft = await this.planning.getDraft(state.tripId);
    const contextSummary = await this.model.summarizeContext({
      instruction: state.instruction, trip, draft, turn: state.modelTurns + 1,
      budget: { tripDays: state.tripDays, modelTurnLimit: state.normalModelTurnLimit, toolCallLimit: state.normalToolCallLimit, toolsExecuted: state.toolsExecuted },
      toolResults: state.toolResults,
    }, state.contextSummary, {
      runId: state.runId, signal: AbortSignal.timeout(timeoutMs),
    });
    return { contextSummary, trip, draft };
  }

  private async runModel(state: typeof AgentState.State): Promise<Partial<typeof AgentState.State>> {
    const trip = state.trip ?? await this.trips.get(state.tripId);
    const draft = state.completionFallbackPhase === "NONE" && this.model.summarizeContext && state.draft
      ? state.draft : await this.planning.getDraft(state.tripId);
    const timeoutMs = state.deadlineAt - Date.now();
    if (timeoutMs <= 0) throw this.timeoutError();
    const signal = AbortSignal.timeout(timeoutMs);
    const turn = state.modelTurns + 1;
    const isCompletionFallback = state.completionFallbackPhase === "AWAITING_MODEL";
    const modelStartedAt = Date.now();
    agentLogger.info({ event: "tour_agent.model.started", runId: state.runId, tripId: state.tripId, turn, modelTurnLimit: state.modelTurnLimit, tripDays: state.tripDays, timeoutMs, ...(isCompletionFallback ? { mode: "completion_fallback" } : {}) });
    let decision: AgentDecision;
    try {
      decision = await this.model.decide({
        instruction: state.instruction,
        trip,
        draft,
        turn,
        budget: {
          tripDays: state.tripDays,
          modelTurnLimit: isCompletionFallback ? state.completionFallbackModelTurnLimit : state.normalModelTurnLimit,
          toolCallLimit: isCompletionFallback ? state.completionFallbackToolCallLimit : state.normalToolCallLimit,
          toolsExecuted: isCompletionFallback ? state.completionFallbackToolsExecuted : state.toolsExecuted,
        },
        ...(isCompletionFallback ? {
          completionFallback: {
            missingDayIndices: Array.from({ length: state.tripDays }, (_, index) => index + 1).filter((dayIndex) => !draft.items.some((item) => item.dayIndex === dayIndex)),
            modelCallsRemaining: Math.max(0, state.completionFallbackModelTurnLimit - state.completionFallbackModelTurns),
            toolCallsRemaining: Math.max(0, state.completionFallbackToolCallLimit - state.completionFallbackToolsExecuted),
          },
          history: state.history,
        } : {
          toolResults: state.contextSummary ? state.toolResults.slice(state.contextSummary.through) : state.toolResults,
          ...(state.contextSummary ? { contextSummary: state.contextSummary.text } : {}),
        }),
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
    const modelHistoryEntry: AgentHistoryEntry = { kind: "model", turn, decision };
    let history = [...state.history, modelHistoryEntry];
    let toolResults = state.toolResults;
    let completionFallbackPhase = state.completionFallbackPhase;
    const missingDayIndices = Array.from({ length: state.tripDays }, (_, index) => index + 1)
      .filter((dayIndex) => !draft.items.some((item) => item.dayIndex === dayIndex));
    if (isCompletionFallback) {
      if (decision.type === "tool_calls" && decision.calls.length > 0) {
        completionFallbackPhase = "AWAITING_TOOLS";
      } else {
        completionFallbackPhase = "FINALIZE";
      }
    } else if (decision.type === "final" && missingDayIndices.length > 0 && explicitlyRequestsItinerary(state.instruction)) {
      const reason = draft.items.length === 0 ? "ITINERARY_REQUIRED" : "ITINERARY_DAYS_INCOMPLETE";
      agentLogger.warn({ event: "tour_agent.final.blocked", runId: state.runId, tripId: state.tripId, turn, reason, missingDayIndices });
      if (state.modelTurnLimit > 0) {
        decision = { type: "tool_calls", calls: [] };
        completionFallbackPhase = "AWAITING_MODEL";
        toolResults = [...state.toolResults, {
          tool: "itinerary_completion_required",
          result: { applied: false, reason, missingDayIndices },
        }];
        history = [...history, { kind: "tool", turn, tool: "itinerary_completion_required", result: { applied: false, reason, missingDayIndices } }];
        agentLogger.info({ event: "tour_agent.completion_fallback.started", runId: state.runId, tripId: state.tripId, missingDayIndices, modelTurnLimit: state.completionFallbackModelTurnLimit, toolCallLimit: state.completionFallbackToolCallLimit });
      } else {
        const text = `Tour chưa hoàn tất: còn thiếu hoạt động cho ngày ${missingDayIndices.join(", ")}. Lượt model dự phòng không khả dụng trong cấu hình hiện tại.`;
        decision = { type: "final", text };
        toolResults = [...state.toolResults, { tool: "itinerary_completion_required", result: { applied: false, reason: "FALLBACK_MODEL_BUDGET_UNAVAILABLE", missingDayIndices } }];
        history = [...history, { kind: "tool", turn, tool: "itinerary_completion_required", result: { applied: false, reason: "FALLBACK_MODEL_BUDGET_UNAVAILABLE", missingDayIndices } }];
      }
    }
    agentLogger.info({ event: "tour_agent.model.completed", runId: state.runId, tripId: state.tripId, turn, modelTurnLimit: state.modelTurnLimit, tripDays: state.tripDays, durationMs: Date.now() - modelStartedAt, decisionType: decision.type, toolCallCount: decision.type === "tool_calls" ? decision.calls.length : 0, ...(isCompletionFallback ? { mode: "completion_fallback" } : {}) });
    return {
      trip,
      draft,
      decision,
      toolResults,
      history,
      modelTurns: state.modelTurns + 1,
      ...(isCompletionFallback ? { completionFallbackModelTurns: state.completionFallbackModelTurns + 1 } : {}),
      completionFallbackPhase,
      ...(decision.type === "final" ? { summary: decision.text } : {}),
    };
  }

  private async runTools(state: typeof AgentState.State): Promise<Partial<typeof AgentState.State>> {
    if (state.decision?.type !== "tool_calls") {
      throw new ApiError(500, "AGENT_INVALID_STATE", "Agent tool node received no tool calls");
    }
    const isCompletionFallback = state.completionFallbackPhase === "AWAITING_TOOLS";
    const remainingCalls = isCompletionFallback
      ? state.completionFallbackToolCallLimit - state.completionFallbackToolsExecuted
      : state.normalToolCallLimit - state.toolsExecuted;
    if (state.decision.calls.length > remainingCalls) {
      agentLogger.warn({ event: "tour_agent.tool_budget.exhausted", runId: state.runId, tripId: state.tripId, tripDays: state.tripDays, turn: state.modelTurns, toolsExecuted: state.toolsExecuted, requestedToolCalls: state.decision.calls.length, toolCallLimit: state.toolCallLimit });
      if (isCompletionFallback) {
        return {
          decision: null,
          completionFallbackPhase: "FINALIZE",
          completionFallbackToolsExecuted: state.completionFallbackToolsExecuted,
          toolResults: [...state.toolResults, { tool: "itinerary_completion_fallback", result: { applied: false, reason: "FALLBACK_TOOL_BUDGET_EXCEEDED" } }],
          history: [...state.history, { kind: "tool", turn: state.modelTurns, tool: "itinerary_completion_fallback", result: { applied: false, reason: "FALLBACK_TOOL_BUDGET_EXCEEDED" } }],
        };
      }
      throw new ApiError(503, "AGENT_TOOL_LIMIT", "The agent reached the allowed tool calls per trip day", { tripDays: state.tripDays, toolsExecuted: state.toolsExecuted, requestedToolCalls: state.decision.calls.length, toolCallLimit: state.normalToolCallLimit });
    }
    const parsedCalls = state.decision.calls.map((call) => {
      const schema = call.name === "add_itinerary_item" ? addItineraryItemToolSchema : call.name === "search_places" ? searchPlacesToolSchema : call.name === "search_knowledge" ? searchKnowledgeToolSchema : call.name === "search_supplier_offers" ? searchSupplierOffersToolSchema : call.name === "search_web" ? searchWebToolSchema : null;
      if (!schema) throw new ApiError(422, "AGENT_TOOL_REJECTED", `Tool '${call.name}' is not allowed`);
      const parsed = schema.safeParse(normalizeAgentToolArguments(call.name, call.arguments));
      return parsed.success
        ? { name: call.name, data: parsed.data, validationError: null }
        : { name: call.name, data: null, validationError: parsed.error.flatten() };
    });
    if (isCompletionFallback) {
      const persistedDraft = await this.planning.getDraft(state.tripId);
      const missingDays = new Set(Array.from({ length: state.tripDays }, (_, index) => index + 1).filter((dayIndex) => !persistedDraft.items.some((item) => item.dayIndex === dayIndex)));
      const requestedDays = new Set<number>();
      const violations: string[] = [];
      for (const [index, call] of state.decision.calls.entries()) {
        const parsed = parsedCalls[index];
        const raw = call.arguments && typeof call.arguments === "object" ? call.arguments as Record<string, unknown> : {};
        if (call.name !== "add_itinerary_item" || parsed?.validationError || !parsed?.data) {
          violations.push("ONLY_VALID_ADD_ITINERARY_ITEM_CALLS_ALLOWED");
          continue;
        }
        const item = parsed.data as ReturnType<typeof addItineraryItemToolSchema.parse>;
        if (!missingDays.has(item.dayIndex) || requestedDays.has(item.dayIndex)) violations.push("DAY_NOT_MISSING_OR_DUPLICATED");
        requestedDays.add(item.dayIndex);
        if (!item.supplierOfferId && item.unitPrice === undefined && !item.unpricedReason?.trim()) violations.push("UNPRICED_REASON_REQUIRED");
        if (raw.externalSourceId !== undefined) violations.push("EXTERNAL_SOURCE_ID_NOT_ALLOWED");
      }
      if (violations.length > 0 || state.decision.calls.length === 0) {
        const reason = [...new Set(violations)].join(",") || "NO_FALLBACK_ACTIVITIES_RETURNED";
        const fallbackToolsExecuted = state.completionFallbackToolsExecuted + state.decision.calls.length;
        const canRetryFallback = state.completionFallbackModelTurns < state.completionFallbackModelTurnLimit
          && fallbackToolsExecuted < state.completionFallbackToolCallLimit;
        agentLogger.warn({ event: "tour_agent.completion_fallback.rejected", runId: state.runId, tripId: state.tripId, reasons: [...new Set(violations)], callCount: state.decision.calls.length });
        return {
          draft: persistedDraft,
          decision: null,
          completionFallbackPhase: canRetryFallback ? "AWAITING_MODEL" : "FINALIZE",
          completionFallbackToolsExecuted: fallbackToolsExecuted,
          toolsExecuted: state.toolsExecuted + state.decision.calls.length,
          toolResults: [...state.toolResults, { tool: "itinerary_completion_fallback", result: { applied: false, reason } }],
          history: [...state.history, { kind: "tool", turn: state.modelTurns, tool: "itinerary_completion_fallback", result: { applied: false, reason } }],
        };
      }
    }
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
      agentLogger.warn({ event: "tour_agent.tool.arguments_rejected", runId: state.runId, tripId: state.tripId, turn: state.modelTurns, invalidCallCount: invalidCalls.length, invalidToolNames: invalidCalls.map((call) => call.name), rejectedBatchCount: state.decision.calls.length, invalidFields });
      return {
        draft: state.draft ?? await this.planning.getDraft(state.tripId),
        decision: null,
        toolsExecuted: state.toolsExecuted + state.decision.calls.length,
        ...(isCompletionFallback ? {
          completionFallbackPhase: state.completionFallbackModelTurns < state.completionFallbackModelTurnLimit
            && state.completionFallbackToolsExecuted + state.decision.calls.length < state.completionFallbackToolCallLimit ? "AWAITING_MODEL" as const : "FINALIZE" as const,
          completionFallbackToolsExecuted: state.completionFallbackToolsExecuted + state.decision.calls.length,
        } : {}),
        webSearchCalls: state.webSearchCalls,
        toolResults: [...state.toolResults, ...validationResults],
        history: [...state.history, ...validationResults.map(({ tool, result }) => ({ kind: "tool" as const, turn: state.modelTurns, tool, result }))],
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
      const toolInput = call.data as { query?: unknown };
      const placeQuery = call.name === "search_places" && typeof toolInput.query === "string"
        ? toolInput.query.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 160)
        : undefined;
      agentLogger.info({ event: "tour_agent.tool.started", runId: state.runId, tripId: state.tripId, turn: state.modelTurns, tool: call.name, toolIndex: index + 1, toolCallNumber: state.toolsExecuted + index + 1, toolCallLimit: state.toolCallLimit, tripDays: state.tripDays, ...(placeQuery ? { query: placeQuery, queryLength: placeQuery.length } : {}) });
      try {
        if (call.name === "add_itinerary_item") {
          const input = call.data as ReturnType<typeof addItineraryItemToolSchema.parse>;
          if (!input.placeId || !input.selectionReason?.trim()) {
            toolResults.push({ tool: call.name, result: { applied: false, reason: !input.placeId ? "PLACE_REQUIRED" : "SELECTION_REASON_REQUIRED", message: "Search for and select a specific OpenStreetMap place, then explain why it fits the trip." } });
            continue;
          }
          const { supplierOfferId, sourceUrl, quantity: requestedQuantity, unit, unitPrice, unitPriceCurrency, unpricedReason, unpricedConfirmationId, placeId, ...activity } = input;
          const unitPriceMinor = unitPrice === undefined ? undefined : majorAmountToMinor(unitPrice, unitPriceCurrency!);
          const hasMatchingSourceUrl = sourceUrl ? isSearchedWebUrl(toolResults, sourceUrl) : false;
          if (sourceUrl && !hasMatchingSourceUrl) {
            toolResults.push({ tool: call.name, result: { applied: false, reason: "SOURCE_URL_NOT_FROM_PLACE_SEARCH", message: "Use the exact external URL returned by search_web for this place." } });
            continue;
          }
          if (supplierOfferId && !searchedSupplierOfferIds(toolResults).includes(supplierOfferId)) {
            toolResults.push({ tool: call.name, result: { applied: false, reason: "SUPPLIER_OFFER_NOT_FROM_SEARCH", message: "Use an exact supplierOfferId returned by search_supplier_offers." } });
            agentLogger.warn({ event: "tour_agent.activity.blocked", runId: state.runId, tripId: state.tripId, turn: state.modelTurns, reason: "SUPPLIER_OFFER_NOT_FROM_SEARCH" });
            continue;
          }
          if (!supplierOfferId && unitPriceMinor === undefined) {
            const previousConfirmation = matchingUnpricedConfirmation(toolResults, { ...activity, placeId });
            const isConfirmed = previousConfirmation !== undefined && unpricedConfirmationId === previousConfirmation.id;
            if (!isConfirmed || !unpricedReason) {
              const confirmationId = previousConfirmation?.id ?? randomUUID();
              toolResults.push({ tool: call.name, result: {
                applied: false,
                reason: "PRICE_RESEARCH_CONFIRMATION_REQUIRED",
                confirmationId,
                dayIndex: activity.dayIndex,
                title: activity.title,
                placeId,
                message: "This activity has no price. Search further if useful. If you decide the available research has no reliable price, resubmit this activity with this unpricedConfirmationId and a concise unpricedReason. If you find a price, submit its source and price instead.",
              } });
              continue;
            }
          }
          const perTravelerUnit = /vé|ticket|person|người|khách/.test((unit ?? "").toLocaleLowerCase("vi"));
          let quantity = requestedQuantity ?? (perTravelerUnit ? state.trip!.travelers : 1);
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
            placeId,
            placeRunId: state.runId,
            quantity,
            ...(unit ? { unit } : {}),
            ...(unitPriceMinor !== undefined ? { unitPriceMinor } : {}),
            ...(unitPriceCurrency ? { unitPriceCurrency } : {}),
            ...(sourceUrl ? { sourceUrl } : {}),
            ...(supplierOfferId ? { supplierOfferId } : {}),
            ...(unpricedReason ? { unpricedReason } : {}),
          });
          draft = result.draft;
          const savedActivity = draft.items.find((item) => item.title === activity.title && item.dayIndex === activity.dayIndex && item.localStartTime === activity.localStartTime);
          toolResults.push({ tool: call.name, result: { applied: true, title: activity.title, activityId: savedActivity?.id, revision: draft.revision, quoteRevision: result.quote.revision, ...(sourceUrl ? { sourceUrl } : {}), ...(unitPrice !== undefined ? { unitPrice, unitPriceCurrency } : {}), ...(unpricedReason ? { unpricedReason } : {}) } });
        } else if (call.name === "search_places") {
          if (!this.places) throw new ApiError(503, "PLACES_NOT_CONFIGURED", "OpenStreetMap search is unavailable");
          const input = call.data as ReturnType<typeof searchPlacesToolSchema.parse>;
          const results = await this.places.search(state.tripId, input.query, { tripId: state.tripId, runId: state.runId });
          resultCount = results.length;
          toolResults.push({ tool: call.name, query: input.query, result: results });
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
        if (isCompletionFallback && !(error instanceof ApiError && error.code === "AGENT_TIMEOUT")) {
          agentLogger.warn({
            event: "tour_agent.completion_fallback.activity_failed",
            runId: state.runId,
            tripId: state.tripId,
            dayIndex: (call.data as { dayIndex?: number }).dayIndex,
            errorCode: error instanceof ApiError ? error.code : error instanceof Error ? error.name : "UNKNOWN_ERROR",
          });
          toolResults.push({ tool: call.name, result: { applied: false, reason: error instanceof ApiError ? error.code : "ACTIVITY_SAVE_FAILED" } });
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
    let completionFallbackPhase: typeof state.completionFallbackPhase | undefined;
    let completionFallbackToolsExecuted: number | undefined;
    if (isCompletionFallback) {
      completionFallbackToolsExecuted = state.completionFallbackToolsExecuted + state.decision.calls.length;
      const currentMissingDays = Array.from({ length: state.tripDays }, (_, index) => index + 1)
        .filter((dayIndex) => !draft.items.some((item) => item.dayIndex === dayIndex));
      completionFallbackPhase = currentMissingDays.length === 0
        || state.completionFallbackModelTurns >= state.completionFallbackModelTurnLimit
        || completionFallbackToolsExecuted >= state.completionFallbackToolCallLimit
        ? "FINALIZE"
        : "AWAITING_MODEL";
    }
    return {
      draft,
      decision: null,
      toolsExecuted: state.toolsExecuted + state.decision.calls.length,
      ...(isCompletionFallback && completionFallbackPhase && completionFallbackToolsExecuted !== undefined ? {
        completionFallbackPhase,
        completionFallbackToolsExecuted,
      } : {}),
      webSearchCalls,
      toolResults,
      history: [...state.history, ...toolResults.slice(state.toolResults.length).map(({ tool, result, query }) => ({ kind: "tool" as const, turn: state.modelTurns, tool, result, ...(query ? { query } : {}) }))],
      sources,
    };
  }

  private async finalizeCompletionFallback(state: typeof AgentState.State): Promise<Partial<typeof AgentState.State>> {
    const draft = await this.planning.getDraft(state.tripId);
    const missingDayIndices = Array.from({ length: state.tripDays }, (_, index) => index + 1)
      .filter((dayIndex) => !draft.items.some((item) => item.dayIndex === dayIndex));
    const summary = missingDayIndices.length === 0
      ? `Đã bổ sung hoạt động cho các ngày còn thiếu. Lịch trình hiện có hoạt động cho đủ ${state.tripDays} ngày; vui lòng rà soát nội dung và giá trước khi gửi khách.`
      : `Tour chưa hoàn tất: vẫn còn thiếu hoạt động cho ngày ${missingDayIndices.join(", ")}. Lượt bổ sung dự phòng đã kết thúc; bạn có thể yêu cầu trợ lý tiếp tục hoặc tự bổ sung các ngày này.`;
    agentLogger.info({
      event: missingDayIndices.length === 0 ? "tour_agent.completion_fallback.completed" : "tour_agent.completion_fallback.incomplete",
      runId: state.runId,
      tripId: state.tripId,
      missingDayIndices,
      completionFallbackToolsExecuted: state.completionFallbackToolsExecuted,
      activityCount: draft.items.length,
    });
    return {
      draft,
      summary,
      decision: { type: "final", text: summary },
      completionFallbackPhase: "NONE",
      toolResults: [...state.toolResults, {
        tool: "itinerary_completion_finalized",
        result: { applied: missingDayIndices.length === 0, missingDayIndices },
      }],
    };
  }

  private timeoutError(): ApiError {
    return new ApiError(504, "AGENT_TIMEOUT", "The agent exceeded its configured run timeout");
  }
}
