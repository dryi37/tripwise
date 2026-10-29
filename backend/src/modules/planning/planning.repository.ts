import type {
  ItineraryDraft,
  ItineraryItem,
  ItineraryItemChanges,
  NewQuoteItem,
  PlanningMutationResult,
  Quote,
  QuoteItemChanges,
} from "./planning.types.js";

export interface PlanningRepository {
  getOrCreateDraft(tripId: string, draftId: string, now: Date): Promise<ItineraryDraft>;
  addItineraryItem(tripId: string, expectedRevision: number, item: ItineraryItem, now: Date): Promise<PlanningMutationResult<ItineraryDraft>>;
  updateItineraryItem(tripId: string, itemId: string, expectedRevision: number, changes: ItineraryItemChanges, now: Date): Promise<PlanningMutationResult<ItineraryDraft>>;
  deleteItineraryItem(tripId: string, itemId: string, expectedRevision: number, now: Date): Promise<PlanningMutationResult<ItineraryDraft>>;
  getOrCreateQuote(tripId: string, quoteId: string, currency: string, now: Date): Promise<Quote>;
  addQuoteItem(tripId: string, expectedRevision: number, item: NewQuoteItem & { id: string; amountMinor: number | null }, now: Date): Promise<PlanningMutationResult<Quote>>;
  updateQuoteItem(tripId: string, itemId: string, expectedRevision: number, changes: QuoteItemChanges, now: Date): Promise<PlanningMutationResult<Quote>>;
  deleteQuoteItem(tripId: string, itemId: string, expectedRevision: number, now: Date): Promise<PlanningMutationResult<Quote>>;
}
