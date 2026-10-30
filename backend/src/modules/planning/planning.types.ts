export interface ItineraryItem {
  id: string;
  dayIndex: number;
  title: string;
  localStartTime: string;
  localEndTime: string;
  timezone: string;
  description: string;
  selectionReason?: string | null | undefined;
  placeProvider?: string | null | undefined;
  placeId?: string | null | undefined;
  placeName?: string | null | undefined;
  placeAddress?: string | null | undefined;
  placeLatitude?: number | null | undefined;
  placeLongitude?: number | null | undefined;
  sourceUrl?: string | null | undefined;
  isLocked: boolean;
  externalSourceId?: string | null;
  supplierOfferId?: string | null;
}

export interface ItineraryDraft {
  id: string;
  tripId: string;
  revision: number;
  items: ItineraryItem[];
  updatedAt: Date;
}

export type ItineraryItemChanges = Partial<Omit<ItineraryItem, "id">>;
export type NewItineraryItem = Omit<ItineraryItem, "id" | "isLocked">;

export interface QuoteItem {
  id: string;
  serviceId?: string | null;
  supplierOfferId?: string | null;
  externalSourceId?: string | null;
  itineraryItemId?: string | null;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  unitPriceMinor: number | null;
  amountMinor: number | null;
  sourceType?: "CATALOG" | "MANUAL" | "EXTERNAL" | "UNPRICED";
  sourceStatus?: "UNVERIFIED" | "VERIFIED" | "INACTIVE" | null;
  priceStatus?: "SOURCE" | "PRICE_OVERRIDDEN" | "MANUAL" | "NEEDS_REVIEW";
  serviceNameSnapshot?: string | null;
  sourceUnitPriceMinor?: number | null;
  termsSnapshot?: string | null;
  sourceUrlSnapshot?: string | null;
  validUntilSnapshot?: string | null;
}

export interface Quote {
  id: string;
  tripId: string;
  currency: string;
  status: "PARTIAL" | "COMPLETE";
  revision: number;
  items: QuoteItem[];
  totalAmountMinor: number;
  updatedAt: Date;
}

export type NewQuoteItem = Omit<QuoteItem, "id" | "amountMinor">;
export type QuoteItemChanges = Partial<Omit<QuoteItem, "id" | "amountMinor">>;

export type PlanningMutationResult<T> =
  | { kind: "updated"; value: T }
  | { kind: "notFound" }
  | { kind: "conflict"; currentRevision: number }
  | { kind: "locked" };
