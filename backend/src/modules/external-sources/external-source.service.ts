import { randomUUID } from "node:crypto";
import { ApiError } from "../../shared/http/api-error.js";
import type { WebSearchCandidate } from "../web-search/web-search.types.js";
import type { ExternalSourceRepository } from "./external-source.repository.js";
import type { ExternalSource } from "./external-source.types.js";

interface Dependencies { createId: () => string; now: () => Date }

export class ExternalSourceService {
  constructor(private readonly repository: ExternalSourceRepository, private readonly dependencies: Dependencies = { createId: randomUUID, now: () => new Date() }) {}

  async persistSearchResults(tripId: string, candidates: WebSearchCandidate[]): Promise<ExternalSource[]> {
    return Promise.all(candidates.map((candidate) => this.repository.upsert({
      id: this.dependencies.createId(), tripId, resultKey: candidate.resultKey, placeName: candidate.name,
      publisher: candidate.publisher, domain: candidate.domain, canonicalUrl: candidate.canonicalUrl,
      title: candidate.title, excerpt: candidate.excerpt, retrievedAt: new Date(candidate.retrievedAt),
      originalAmountMinor: candidate.amountMinor, originalCurrency: candidate.currency,
      pricingUnit: candidate.pricingUnit ?? "ticket", audience: candidate.audience ?? "person",
      suitable: candidate.suitable, confidence: candidate.confidence, verificationStatus: candidate.verificationStatus,
      evidence: { constraints: candidate.constraints, conflicts: candidate.conflicts, stale: candidate.stale, openingHours: candidate.openingHours, closedDates: candidate.closedDates, closedWeekdays: candidate.closedWeekdays, latitude: candidate.latitude, longitude: candidate.longitude, recommendedDurationMinutes: candidate.recommendedDurationMinutes, advanceBooking: candidate.advanceBooking, accessibility: candidate.accessibility },
    }, this.dependencies.now())));
  }

  async getForTrip(tripId: string, id: string): Promise<ExternalSource> {
    const source = await this.repository.findById(id);
    if (!source || source.tripId !== tripId) throw new ApiError(404, "EXTERNAL_SOURCE_NOT_FOUND", "External source not found for this trip");
    return source;
  }

  list(tripId: string): Promise<ExternalSource[]> { return this.repository.listByTrip(tripId); }
}
