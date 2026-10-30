export type Weekday = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";

export interface RawWebSearchResult {
  resultKey: string;
  name: string;
  title: string;
  url: string;
  publisher?: string;
  excerpt: string;
  /** Price in the smallest unit of currency (for example USD 12.50 is 1250). */
  amount?: number;
  currency?: string;
  pricingUnit?: string;
  audience?: string;
  validityText?: string;
  retrievedAt?: string;
  openingHours?: Array<{ day: Weekday; opens: string; closes: string }>;
  closedWeekdays?: Weekday[];
  closedDates?: string[];
  seasonConstraints?: string[];
  weatherConstraints?: string[];
  expectedWeather?: string[];
  advanceBooking?: string;
  recommendedDurationMinutes?: number;
  latitude?: number;
  longitude?: number;
  accessibility?: string[];
  conflicts?: string[];
}

export interface WebSearchQuery {
  query: string;
  destination: string;
  startDate: string;
  endDate: string;
  adultCount: number;
  childCount: number;
}

export interface WebSearchInput extends WebSearchQuery { limit: number }

export interface WebSearchCandidate extends Omit<RawWebSearchResult, "amount" | "currency" | "publisher" | "retrievedAt"> {
  publisher: string;
  domain: string;
  canonicalUrl: string;
  amountMinor: number;
  currency: string;
  retrievedAt: string;
  suitable: boolean;
  constraints: string[];
  confidence: number;
  stale: boolean;
  verificationStatus: "UNVERIFIED";
}
