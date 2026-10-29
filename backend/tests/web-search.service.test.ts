import { describe, expect, it } from "vitest";

import type { WebSearchProvider } from "../src/modules/web-search/web-search.provider.js";
import { WebSearchService } from "../src/modules/web-search/web-search.service.js";
import type { RawWebSearchResult } from "../src/modules/web-search/web-search.types.js";

const trip = { destination: "Seoul", startDate: "2027-04-05", endDate: "2027-04-09", adultCount: 2, childCount: 1 };

const provider = (results: RawWebSearchResult[]): WebSearchProvider => ({ search: async () => results });

describe("WebSearchService", () => {
  it("returns every web result to the agent even when price normalization cannot create a saved source", async () => {
    const service = new WebSearchService(provider([
      { resultKey: "no-price", name: "Bukchon", title: "Visit Bukchon", url: "https://visitkorea.example/bukchon", publisher: "Visit Korea", excerpt: "A residential neighborhood with traditional houses." },
      { resultKey: "no-price-raw", name: "Bukchon details", title: "Visitor guidance", url: "https://visitkorea.example/guide", publisher: "Visit Korea", excerpt: "A short excerpt.", rawContent: "Full official content with access, etiquette, and opening details." },
      { resultKey: "multi-price", name: "Gyeongbokgung", title: "Palace tickets", url: "https://palace.example/tickets", publisher: "Palace", excerpt: "Adults KRW 3,000; children KRW 1,500", amount: 3000, currency: "KRW" },
    ]), { now: () => new Date("2026-10-29T00:00:00Z"), maxResults: 5, staleAfterDays: 180 });

    const response = await service.searchForAgent({ query: "Seoul attractions", ...trip });

    expect(response.results).toHaveLength(3);
    expect(response.results.map(({ resultKey }) => resultKey)).toEqual(["no-price", "no-price-raw", "multi-price"]);
    expect(response.results[0]?.excerpt).toContain("residential neighborhood");
    expect(response.results[1]?.rawContent).toContain("Full official content");
    expect(response.priceCandidates).toEqual([]);
  });

  it("normalizes public price evidence and assesses trip-date suitability", async () => {
    const service = new WebSearchService(provider([{
      resultKey: "palace-1", name: "Gyeongbokgung Palace", title: "Admission guide",
      url: "https://royal.cha.go.kr/ENG/contents/E101010000.do", publisher: "Korea Heritage Service",
      excerpt: "Open Monday; adult admission KRW 3,000. Closed Tuesdays.",
      amount: 3000, currency: "krw", pricingUnit: "ticket", audience: "adult",
      openingHours: [{ day: "MONDAY", opens: "09:00", closes: "18:00" }], closedWeekdays: ["TUESDAY"],
      latitude: 37.5796, longitude: 126.977,
    }]), { now: () => new Date("2026-10-27T00:00:00Z"), maxResults: 5, staleAfterDays: 180 });

    const { priceCandidates: results } = await service.searchForAgent({ query: "palace ticket", ...trip });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ amountMinor: 3000, currency: "KRW", pricingUnit: "ticket", audience: "adult", suitable: true, verificationStatus: "UNVERIFIED" });
    expect(results[0]?.confidence).toBeGreaterThan(0.7);
  });

  it("rejects malformed prices and marks closures or weather constraints unsuitable", async () => {
    const service = new WebSearchService(provider([
      { resultKey: "bad", name: "Bad", title: "Bad", url: "https://example.com/bad", excerpt: "price", amount: -1, currency: "KRW" },
      { resultKey: "closed", name: "Closed", title: "Closure", url: "https://closed-place.example/closed", excerpt: "Closed KRW 1,000", amount: 1000, currency: "KRW", openingHours: [{ day: "MONDAY", opens: "09:00", closes: "18:00" }], closedDates: ["2027-04-05"] },
      { resultKey: "rain", name: "Outdoor", title: "Weather", url: "https://outdoor-place.example/rain", excerpt: "Closes in rain KRW 1,000", amount: 1000, currency: "KRW", openingHours: [{ day: "MONDAY", opens: "09:00", closes: "18:00" }], weatherConstraints: ["RAIN"], expectedWeather: ["RAIN"] },
    ]), { now: () => new Date("2026-10-27T00:00:00Z"), maxResults: 5, staleAfterDays: 180 });

    const { priceCandidates: results } = await service.searchForAgent({ query: "tickets", ...trip });

    expect(results.map((x) => x.resultKey)).toEqual(["closed", "rain"]);
    expect(results.every((x) => !x.suitable)).toBe(true);
    expect(results.flatMap((x) => x.constraints)).toEqual(expect.arrayContaining([expect.stringContaining("closed"), expect.stringContaining("weather")]));
  });

  it("caps results, preserves conflicts, and lowers confidence for stale evidence", async () => {
    const service = new WebSearchService(provider(Array.from({ length: 4 }, (_, index) => ({
      resultKey: `r-${index}`, name: `Place ${index}`, title: "Tickets", url: `https://example.com/${index}`,
      excerpt: "Published ticket price USD 1,000", amount: 1000, currency: "USD", retrievedAt: "2025-01-01T00:00:00Z", openingHours: [{ day: "MONDAY", opens: "09:00", closes: "18:00" }],
      conflicts: ["Official page says 10; reseller says 12"],
    }))), { now: () => new Date("2026-10-27T00:00:00Z"), maxResults: 2, staleAfterDays: 180 });

    const { priceCandidates: results } = await service.searchForAgent({ query: "tickets", ...trip });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ stale: true, conflicts: [expect.any(String)] });
    expect(results[0]?.confidence).toBeLessThan(0.5);
  });

  it("requests and returns the configured number of results", async () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      resultKey: `r-${index}`, name: `Place ${index}`, title: "Tickets", url: `https://example.com/${index}`,
      excerpt: "Published ticket price USD 1,000", amount: 1000, currency: "USD",
    }));
    let requestedLimit = 0;
    const service = new WebSearchService({ search: async ({ limit }) => { requestedLimit = limit; return rows; } }, { now: () => new Date("2026-10-29T00:00:00Z"), maxResults: 7, staleAfterDays: 180 });

    const response = await service.searchForAgent({ query: "tickets", ...trip });

    expect(requestedLimit).toBe(7);
    expect(response.results).toHaveLength(7);
    expect(response.priceCandidates).toHaveLength(7);
  });
});

