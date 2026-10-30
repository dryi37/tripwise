import type { ItineraryDraft } from "../planning/planning.types.js";
import type { Trip } from "../trips/trip.types.js";

export interface AgentToolCall {
  name: string;
  arguments: unknown;
}

export type AgentDecision =
  | { type: "tool_calls"; calls: AgentToolCall[] }
  | { type: "final"; text: string };

export type AgentHistoryEntry =
  | { kind: "model"; turn: number; decision: AgentDecision }
  | { kind: "tool"; turn: number; tool: string; result: unknown; query?: string };

export interface AgentModelInput {
  instruction: string;
  trip: Trip;
  draft: ItineraryDraft;
  turn: number;
  budget?: { tripDays: number; modelTurnLimit: number; toolCallLimit: number; toolsExecuted: number };
  toolResults?: Array<{ tool: string; result: unknown; query?: string }>;
  history?: AgentHistoryEntry[];
  completionFallback?: { missingDayIndices: number[]; modelCallsRemaining: number; toolCallsRemaining: number };
}

export interface AgentModelCallOptions {
  runId: string;
  signal: AbortSignal;
}

export interface AgentModel {
  decide(input: AgentModelInput, options?: AgentModelCallOptions): Promise<AgentDecision>;
}
