import type { ItineraryDraft, Quote } from "../planning/planning.types.js";
import type { Trip } from "../trips/trip.types.js";

export interface PlanSnapshot { trip: Trip; draft: ItineraryDraft; quote: Quote }
export interface PlanVersion { id: string; tripId: string; name: string; revision: number; snapshot: PlanSnapshot; createdAt: Date }
export type RestoreVersionResult = { kind: "updated"; value: PlanSnapshot } | { kind: "conflict"; currentRevision: number } | { kind: "notFound" };
export interface PlanVersionRepository {
  list(tripId: string, skip: number, take: number): Promise<{ rows: PlanVersion[]; total: number }>;
  create(value: PlanVersion): Promise<PlanVersion>;
  findById(tripId: string, id: string): Promise<PlanVersion | null>;
  restore(tripId: string, snapshot: PlanSnapshot, expectedRevision: number, expectedDraftRevision: number, expectedQuoteRevision: number, now: Date): Promise<RestoreVersionResult>;
}
