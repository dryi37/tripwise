export interface ExternalSource {
  id: string;
  tripId: string;
  resultKey: string;
  placeName: string;
  publisher: string;
  domain: string;
  canonicalUrl: string;
  title: string;
  excerpt: string;
  retrievedAt: Date;
  originalAmountMinor: number;
  originalCurrency: string;
  pricingUnit: string;
  audience: string;
  suitable: boolean;
  confidence: number;
  verificationStatus: "UNVERIFIED" | "VERIFIED" | "REJECTED";
  evidence: Record<string, unknown>;
  createdAt: Date;
}

export type NewExternalSource = Omit<ExternalSource, "createdAt">;
