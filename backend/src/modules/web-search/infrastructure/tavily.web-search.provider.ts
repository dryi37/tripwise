import { ApiError } from "../../../shared/http/api-error.js";
import type { WebSearchProvider } from "../web-search.provider.js";
import type { RawWebSearchResult, Weekday, WebSearchInput } from "../web-search.types.js";

const weekdays: Array<{ label: string; day: Weekday }> = [
  { label: "mon(?:day)?", day: "MONDAY" }, { label: "tue(?:sday)?", day: "TUESDAY" },
  { label: "wed(?:nesday)?", day: "WEDNESDAY" }, { label: "thu(?:rsday)?", day: "THURSDAY" },
  { label: "fri(?:day)?", day: "FRIDAY" }, { label: "sat(?:urday)?", day: "SATURDAY" },
  { label: "sun(?:day)?", day: "SUNDAY" },
];

function extractHours(text: string) {
  const hoursLabel = /(?:opening\s+hours?|open\s+(?:daily|every\s+day)|daily\s+hours?|thời\s+gian\s+mở\s+cửa|giờ\s+mở\s+cửa)/i;
  const match = text.match(/(?:opening\s+hours?|open\s+(?:daily|every\s+day)|daily\s+hours?|thời\s+gian\s+mở\s+cửa|giờ\s+mở\s+cửa)?[^\d]{0,40}(\d{1,2}:\d{2})\s*(?:-|–|to|đến)\s*(\d{1,2}:\d{2})/i);
  if (!match || !hoursLabel.test(text)) return undefined;
  const closedWeekdays = weekdays.filter(({ label }) => new RegExp(`closed\\s+(?:on\\s+)?${label}s?`, "i").test(text)).map(({ day }) => day);
  const explicitDays = weekdays.filter(({ label }) => new RegExp(`(?:open|hours?)\\s+(?:on\\s+)?${label}s?`, "i").test(text)).map(({ day }) => day);
  const saysDaily = /(?:daily|every\s+day|all\s+week)/i.test(text);
  const days = explicitDays.length ? explicitDays : saysDaily ? weekdays.map(({ day }) => day).filter((day) => !closedWeekdays.includes(day)) : [];
  return { openingHours: days.map((day) => ({ day, opens: match[1]!.padStart(5, "0"), closes: match[2]!.padStart(5, "0") })), closedWeekdays };
}

export class TavilyWebSearchProvider implements WebSearchProvider {
  constructor(private readonly apiKey: string | undefined, private readonly timeoutMs: number) {}

  async search(input: WebSearchInput): Promise<RawWebSearchResult[]> {
    if (!this.apiKey) throw new ApiError(503, "WEB_SEARCH_NOT_CONFIGURED", "Set TAVILY_API_KEY to use web search");
    try {
      const response = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ api_key: this.apiKey, query: `${input.query} ${input.destination}`, max_results: input.limit, search_depth: "advanced", include_raw_content: true }), signal: AbortSignal.timeout(this.timeoutMs) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { results?: Array<{ url?: string; title?: string; content?: string; raw_content?: string }> };
      return (body.results ?? []).map((result, index) => {
        const url = result.url ?? "";
        const title = result.title ?? "";
        const text = (result.content ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        const pricePattern = /(?:\b(VND|KRW|USD|EUR|JPY)\s*([\d][\d.,]*)|([\d][\d.,]*)\s*(VND|KRW|USD|EUR|JPY)\b)/gi;
        const prices = [...text.matchAll(pricePattern)];
        const parsed = prices.map((price) => {
          const currency = (price[1] ?? price[4] ?? "").toUpperCase();
          const raw = price[2] ?? price[3] ?? "";
          const normalized = currency === "VND" || currency === "KRW" || currency === "JPY"
            ? raw.replace(/[.,]/g, "")
            : raw.replace(/,(?=\d{3}(?:\D|$))/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "");
          return { currency, amount: Number(normalized) };
        });
        const uniquePrices = new Map(parsed.map((price) => [`${price.currency}:${price.amount}`, price]));
        const hours = extractHours(text);
        let hostname = "";
        try { hostname = new URL(url).hostname; } catch { /* Preserve the search result for the agent to assess. */ }
        const price = uniquePrices.size === 1 ? [...uniquePrices.values()][0] : undefined;
        const hasParsedPrice = price !== undefined && Number.isSafeInteger(price.amount) && price.amount >= 0;
        const priceText = hasParsedPrice ? prices[0]?.[0] : undefined;
        const priceIndex = priceText ? text.indexOf(priceText) : -1;
        const priceContext = priceIndex >= 0 && priceText
          ? text.slice(Math.max(0, priceIndex - 60), Math.min(text.length, priceIndex + priceText.length + 60))
          : "";
        return {
          resultKey: `${hostname || "search"}:${index}:${title}`.slice(0, 240),
          name: title,
          title,
          url,
          publisher: hostname,
          excerpt: text,
          ...(result.raw_content ? { rawContent: result.raw_content } : {}),
          ...(hasParsedPrice ? {
            amount: price!.amount,
            currency: price!.currency,
            audience: /\bchild(?:ren)?\b|trẻ\s+em/i.test(priceContext) ? "child"
              : /\badult\b|người\s+lớn/i.test(priceContext) ? "adult"
                : /foreigner|foreign\s+visitor|khách\s+nước\s+ngoài/i.test(priceContext) ? "foreign"
                  : "person",
            pricingUnit: /group|đoàn|per\s+group/i.test(priceContext) ? "group"
              : /person|per\s+person|người|\/pax/i.test(priceContext) ? "person" : "ticket",
          } : {}),
          ...(hours ? hours : {}),
        };
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, "WEB_SEARCH_UNAVAILABLE", "Web search is temporarily unavailable");
    }
  }
}
