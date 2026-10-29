import type { ItineraryDraft } from "../planning/planning.types.js";

export interface RunTourAgentInput {
  instruction: string;
}

export interface TourAgentResult {
  summary: string;
  modelTurns: number;
  toolsExecuted: number;
  draft: ItineraryDraft;
  sources: Array<{ documentId?: string; externalSourceId?: string; title: string; sourceLabel: string | null; url?: string }>;
  warnings: string[];
}
