import { describe, expect, it } from "vitest";

import { ExternalSourceService } from "../src/modules/external-sources/external-source.service.js";
import { InMemoryExternalSourceRepository } from "../src/modules/external-sources/infrastructure/in-memory-external-source.repository.js";
import type { WebSearchCandidate } from "../src/modules/web-search/web-search.types.js";

const candidate: WebSearchCandidate = {
  resultKey: "official:palace", name: "Gyeongbokgung", title: "Admission", url: "https://royal.example/tickets#price",
  canonicalUrl: "https://royal.example/tickets", publisher: "Royal Palaces", domain: "royal.example", excerpt: "Adult KRW 3,000",
  amountMinor: 3000, currency: "KRW", pricingUnit: "ticket", audience: "adult", retrievedAt: "2026-10-27T00:00:00.000Z",
  suitable: true, constraints: [], confidence: 0.85, stale: false, verificationStatus: "UNVERIFIED", conflicts: [],
};

describe("ExternalSourceService", () => {
  it("persists a cited candidate and reuses its canonical source within a trip", async () => {
    let id = 0;
    const service = new ExternalSourceService(new InMemoryExternalSourceRepository(), { createId: () => `source-${++id}`, now: () => new Date("2026-10-27T00:00:00Z") });

    const first = await service.persistSearchResults("trip-1", [candidate]);
    const second = await service.persistSearchResults("trip-1", [{ ...candidate, resultKey: "duplicate", url: "https://royal.example/tickets#hours" }]);

    expect(first[0]).toMatchObject({ id: "source-1", tripId: "trip-1", canonicalUrl: "https://royal.example/tickets", verificationStatus: "UNVERIFIED" });
    expect(second[0]?.id).toBe(first[0]?.id);
    expect(await service.list("trip-1")).toHaveLength(1);
  });

  it("does not return a source from another trip", async () => {
    const service = new ExternalSourceService(new InMemoryExternalSourceRepository(), { createId: () => "source-1", now: () => new Date() });
    await service.persistSearchResults("trip-1", [candidate]);
    await expect(service.getForTrip("trip-2", "source-1")).rejects.toMatchObject({ code: "EXTERNAL_SOURCE_NOT_FOUND" });
  });
});
