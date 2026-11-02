import { randomUUID } from "node:crypto";

import { ApiError } from "../../../shared/http/api-error.js";
import { agentLogger } from "../../../shared/observability/agent-logger.js";
import type { AgentDecision, AgentModel, AgentModelCallOptions, AgentModelInput } from "../agent-model.js";
import { agentFunctionDeclarations, buildAgentPrompt, resolveFinalText } from "./gemma-agent.model.js";

export interface OpenAICompatibleAgentConfig {
  baseUrl: string;
  apiKey?: string | undefined;
  model: string;
  requestTimeoutMs: number;
  maxRetries: number;
  maxToolResultContextChars: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  maxOutputTokens: number;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toOpenAISchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toOpenAISchema);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    key === "type" && typeof item === "string" ? item.toLowerCase() : toOpenAISchema(item),
  ]));
}

function openAITools(onlyAddActivity: boolean): JsonRecord[] {
  return agentFunctionDeclarations
    .filter((declaration) => !onlyAddActivity || declaration.name === "add_itinerary_item")
    .map((declaration) => ({
      type: "function",
      function: {
        name: declaration.name,
        description: declaration.description,
        parameters: toOpenAISchema(declaration.parameters),
      },
    }));
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!signal) { setTimeout(resolve, delayMs); return; }
    if (signal.aborted) { reject(signal.reason); return; }
    const timeout = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, delayMs);
    const onAbort = () => { clearTimeout(timeout); reject(signal.reason); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function statusOf(error: unknown): number | undefined {
  return isRecord(error) && typeof error.status === "number" ? error.status : undefined;
}

type GatewayWaiter = { resolve: (release: () => void) => void; reject: (error: unknown) => void; signal?: AbortSignal | undefined; onAbort?: (() => void) | undefined };
let gatewayRequestsInFlight = 0;
const gatewayWaiters: GatewayWaiter[] = [];

function releaseGatewaySlot(): void {
  const next = gatewayWaiters.shift();
  if (!next) { gatewayRequestsInFlight -= 1; return; }
  if (next.signal && next.onAbort) next.signal.removeEventListener("abort", next.onAbort);
  next.resolve(() => releaseGatewaySlot());
}

function acquireGatewaySlot(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (gatewayRequestsInFlight < 4) {
    gatewayRequestsInFlight += 1;
    return Promise.resolve(() => releaseGatewaySlot());
  }
  return new Promise((resolve, reject) => {
    const waiter: GatewayWaiter = { resolve, reject, signal };
    if (signal) {
      waiter.onAbort = () => {
        const index = gatewayWaiters.indexOf(waiter);
        if (index >= 0) gatewayWaiters.splice(index, 1);
        reject(signal.reason);
      };
      signal.addEventListener("abort", waiter.onAbort, { once: true });
    }
    gatewayWaiters.push(waiter);
  });
}

export class OpenAICompatibleAgentModel implements AgentModel {
  constructor(private readonly config: OpenAICompatibleAgentConfig) {}

  async decide(input: AgentModelInput, options?: AgentModelCallOptions): Promise<AgentDecision> {
    if (!this.config.apiKey) throw new ApiError(503, "AI_NOT_CONFIGURED", "Set GX10_API_KEY to use the GX10 tour agent");
    const runId = options?.runId ?? `standalone-${randomUUID()}`;
    const prompt = buildAgentPrompt(input, this.config.maxToolResultContextChars);
    const requiresItineraryItem = Boolean(input.completionFallback);
    const runSignal = options?.signal;
    let attempts = 0;
    let lastAttemptTimedOut = false;
    let payload: unknown;

    agentLogger.info({
      event: "tour_agent.model.input_prepared",
      provider: "gx10",
      model: this.config.model,
      runId,
      turn: input.turn,
      promptChars: prompt.length,
      toolResultCount: input.toolResults?.length ?? 0,
      ...(input.completionFallback ? { mode: "completion_fallback", missingDayIndices: input.completionFallback.missingDayIndices, historyEntryCount: input.history?.length ?? 0 } : {}),
      forcedToolChoice: requiresItineraryItem ? "add_itinerary_item" : undefined,
    });

    try {
      for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt += 1) {
        attempts = attempt;
        lastAttemptTimedOut = false;
        const timeoutSignal = AbortSignal.timeout(this.config.requestTimeoutMs);
        const signal = runSignal ? AbortSignal.any([runSignal, timeoutSignal]) : timeoutSignal;
        let response: Response;
        try {
          const releaseSlot = await acquireGatewaySlot(signal);
          try {
            response = await fetch(`${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
              method: "POST",
              headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
              signal,
              body: JSON.stringify({
                model: this.config.model,
                messages: [{ role: "user", content: prompt }],
                tools: openAITools(requiresItineraryItem),
                ...(requiresItineraryItem ? { tool_choice: { type: "function", function: { name: "add_itinerary_item" } } } : {}),
                max_tokens: this.config.maxOutputTokens,
                chat_template_kwargs: { enable_thinking: true },
              }),
            });
            if (!response.ok) {
              const error = Object.assign(new Error(`GX10 returned HTTP ${response.status}`), { status: response.status });
              throw error;
            }
            payload = await response.json();
          } finally {
            releaseSlot();
          }
          break;
        } catch (error) {
          if (runSignal?.aborted) throw error;
          lastAttemptTimedOut = timeoutSignal.aborted;
          const status = statusOf(error);
          const retryable = lastAttemptTimedOut || status === 408 || status === 429 || (status !== undefined && status >= 500);
          if (!retryable || attempt > this.config.maxRetries) throw error;
          const delayMs = Math.min(this.config.retryBaseDelayMs * 2 ** (attempt - 1), this.config.retryMaxDelayMs);
          agentLogger.warn({ event: "tour_agent.model.retry_scheduled", provider: "gx10", model: this.config.model, runId, turn: input.turn, attempt, nextAttempt: attempt + 1, maxAttempts: this.config.maxRetries + 1, status, delayMs });
          await waitForRetry(delayMs, runSignal);
        }
      }
    } catch (error) {
      const timedOut = runSignal?.aborted === true || lastAttemptTimedOut;
      agentLogger.error({ event: "tour_agent.model.provider_failed", provider: "gx10", model: this.config.model, runId, turn: input.turn, errorName: error instanceof Error ? error.name : "UnknownError", status: statusOf(error), attempts, timedOut });
      if (timedOut) throw new ApiError(504, "AGENT_TIMEOUT", "The agent exceeded its model or run timeout");
      throw new ApiError(503, "AI_PROVIDER_UNAVAILABLE", "GX10 is temporarily unavailable or misconfigured");
    }

    const result = isRecord(payload) && Array.isArray(payload.choices) ? payload.choices[0] : undefined;
    const message = isRecord(result) && isRecord(result.message) ? result.message : undefined;
    const toolCalls = message && Array.isArray(message.tool_calls) ? message.tool_calls : [];
    const calls: Array<{ name: string; arguments: unknown }> = [];
    for (const call of toolCalls) {
      if (!isRecord(call) || !isRecord(call.function) || typeof call.function.name !== "string") {
        throw new ApiError(502, "AI_INVALID_TOOL_CALL", "GX10 returned an invalid tool call");
      }
      try {
        calls.push({ name: call.function.name, arguments: JSON.parse(String(call.function.arguments ?? "{}")) as unknown });
      } catch {
        throw new ApiError(502, "AI_INVALID_TOOL_CALL", "GX10 returned malformed tool arguments");
      }
    }
    if (calls.length) return { type: "tool_calls", calls };
    const text = resolveFinalText(typeof message?.content === "string" ? message.content : undefined, input.toolResults);
    if (!text) throw new ApiError(502, "AI_EMPTY_RESPONSE", "GX10 returned no tool call or final response");
    return { type: "final", text };
  }
}
