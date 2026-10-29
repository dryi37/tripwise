import { afterEach, describe, expect, it, vi } from "vitest";

import { TavilyWebSearchProvider } from "../src/modules/web-search/infrastructure/tavily.web-search.provider.js";

afterEach(() => vi.unstubAllGlobals());

describe("TavilyWebSearchProvider", () => {
  it("returns every Tavily result, raw page content, and the unmodified agent query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { url: "https://visit.example/bukchon", title: "Visit Bukchon", content: "A residential neighborhood with traditional houses and public visitor guidance.", raw_content: "Full Bukchon page content." },
      { url: "https://palace.example/tickets", title: "Palace admissions", content: "Adults KRW 3,000; children KRW 1,500." },
      { url: "https://royal.example/tickets", title: "Palace admission", content: "Adult admission KRW 3,000." },
    ] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new TavilyWebSearchProvider("test-key", 1_000);

    const results = await provider.search({
      query: "Seoul attractions", destination: "Seoul", startDate: "2026-11-20", endDate: "2026-11-21",
      adultCount: 2, childCount: 0, limit: 5,
    });

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ title: "Visit Bukchon", url: "https://visit.example/bukchon" });
    expect((results[0] as { excerpt: string }).excerpt).toContain("public visitor guidance");
    expect((results[0] as { rawContent: string }).rawContent).toBe("Full Bukchon page content.");
    expect(results[0]).not.toHaveProperty("amount");
    expect(results[1]).not.toHaveProperty("amount");
    expect(results[2]).toMatchObject({ amount: 3000, currency: "KRW" });
    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as Record<string, unknown>;
    expect(requestBody).toMatchObject({ query: "Seoul attractions Seoul", max_results: 5, include_raw_content: true });
  });
});
