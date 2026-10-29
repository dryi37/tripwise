import type { PlanningRepository } from "../planning.repository.js";
import type {
  ItineraryDraft,
  ItineraryItem,
  ItineraryItemChanges,
  NewQuoteItem,
  PlanningMutationResult,
  Quote,
  QuoteItemChanges,
} from "../planning.types.js";

const cloneDraft = (draft: ItineraryDraft): ItineraryDraft => ({
  ...draft,
  items: draft.items.map((item) => ({ ...item })),
  updatedAt: new Date(draft.updatedAt),
});

const cloneQuote = (quote: Quote): Quote => ({
  ...quote,
  items: quote.items.map((item) => item.priceStatus === "NEEDS_REVIEW"
    ? { ...item, unitPriceMinor: null, amountMinor: null }
    : { ...item }),
  updatedAt: new Date(quote.updatedAt),
});

function recalculate(quote: Quote): Quote {
  const totalAmountMinor = quote.items.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0);
  return { ...quote, totalAmountMinor, status: quote.items.length ? "COMPLETE" : "PARTIAL" };
}

export class InMemoryPlanningRepository implements PlanningRepository {
  private readonly drafts = new Map<string, ItineraryDraft>();
  private readonly quotes = new Map<string, Quote>();
  public itineraryMutationCount = 0;

  async getOrCreateDraft(tripId: string, draftId: string, now: Date): Promise<ItineraryDraft> {
    const existing = this.drafts.get(tripId);
    if (existing) return cloneDraft(existing);
    const draft = { id: draftId, tripId, revision: 1, items: [], updatedAt: now };
    this.drafts.set(tripId, draft);
    return cloneDraft(draft);
  }

  async addItineraryItem(tripId: string, expectedRevision: number, item: ItineraryItem, now: Date) {
    this.itineraryMutationCount += 1;
    const draft = this.drafts.get(tripId);
    if (!draft) return { kind: "notFound" } as const;
    if (draft.revision !== expectedRevision) return { kind: "conflict", currentRevision: draft.revision } as const;
    draft.items.push({ ...item, externalSourceId: item.externalSourceId ?? null, sourceUrl: item.sourceUrl ?? null });
    draft.revision += 1;
    draft.updatedAt = now;
    return { kind: "updated", value: cloneDraft(draft) } as const;
  }

  async updateItineraryItem(tripId: string, itemId: string, expectedRevision: number, changes: ItineraryItemChanges, now: Date) {
    this.itineraryMutationCount += 1;
    const draft = this.drafts.get(tripId);
    if (!draft) return { kind: "notFound" } as const;
    if (draft.revision !== expectedRevision) return { kind: "conflict", currentRevision: draft.revision } as const;
    const index = draft.items.findIndex((item) => item.id === itemId);
    if (index < 0) return { kind: "notFound" } as const;
    const current = draft.items[index]!;
    draft.items[index] = { ...current, ...changes };
    draft.revision += 1;
    draft.updatedAt = now;
    return { kind: "updated", value: cloneDraft(draft) } as const;
  }

  async deleteItineraryItem(tripId: string, itemId: string, expectedRevision: number, now: Date) {
    this.itineraryMutationCount += 1;
    const draft = this.drafts.get(tripId);
    if (!draft) return { kind: "notFound" } as const;
    if (draft.revision !== expectedRevision) return { kind: "conflict", currentRevision: draft.revision } as const;
    const index = draft.items.findIndex((item) => item.id === itemId);
    if (index < 0) return { kind: "notFound" } as const;
    draft.items.splice(index, 1);
    const quote = this.quotes.get(tripId);
    if (quote) quote.items = quote.items.map((item) => item.itineraryItemId === itemId ? { ...item, itineraryItemId: null } : item);
    draft.revision += 1;
    draft.updatedAt = now;
    return { kind: "updated", value: cloneDraft(draft) } as const;
  }

  async getOrCreateQuote(tripId: string, quoteId: string, currency: string, now: Date): Promise<Quote> {
    const existing = this.quotes.get(tripId);
    if (existing) return cloneQuote(existing);
    const quote: Quote = { id: quoteId, tripId, currency, status: "PARTIAL", revision: 1, items: [], totalAmountMinor: 0, updatedAt: now };
    this.quotes.set(tripId, quote);
    return cloneQuote(quote);
  }

  async addQuoteItem(tripId: string, expectedRevision: number, item: NewQuoteItem & { id: string; amountMinor: number | null }, now: Date) {
    const quote = this.quotes.get(tripId);
    if (!quote) return { kind: "notFound" } as const;
    if (quote.revision !== expectedRevision) return { kind: "conflict", currentRevision: quote.revision } as const;
    quote.items.push({ ...item });
    quote.revision += 1;
    quote.updatedAt = now;
    Object.assign(quote, recalculate(quote));
    return { kind: "updated", value: cloneQuote(quote) } as const;
  }

  async updateQuoteItem(tripId: string, itemId: string, expectedRevision: number, changes: QuoteItemChanges, now: Date) {
    const quote = this.quotes.get(tripId);
    if (!quote) return { kind: "notFound" } as const;
    if (quote.revision !== expectedRevision) return { kind: "conflict", currentRevision: quote.revision } as const;
    const index = quote.items.findIndex((item) => item.id === itemId);
    if (index < 0) return { kind: "notFound" } as const;
    const item = { ...quote.items[index]!, ...changes };
    item.amountMinor = item.unitPriceMinor === null ? null : item.quantity * item.unitPriceMinor;
    quote.items[index] = item;
    quote.revision += 1;
    quote.updatedAt = now;
    Object.assign(quote, recalculate(quote));
    return { kind: "updated", value: cloneQuote(quote) } as const;
  }

  async deleteQuoteItem(tripId: string, itemId: string, expectedRevision: number, now: Date) {
    const quote = this.quotes.get(tripId);
    if (!quote) return { kind: "notFound" } as const;
    if (quote.revision !== expectedRevision) return { kind: "conflict", currentRevision: quote.revision } as const;
    const index = quote.items.findIndex((item) => item.id === itemId);
    if (index < 0) return { kind: "notFound" } as const;
    quote.items.splice(index, 1);
    quote.revision += 1;
    quote.updatedAt = now;
    Object.assign(quote, recalculate(quote));
    return { kind: "updated", value: cloneQuote(quote) } as const;
  }
}
