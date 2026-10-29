import type { WebSearchProvider } from "./web-search.provider.js";
import type { RawWebSearchResult, WebSearchCandidate, WebSearchInput, WebSearchQuery, Weekday } from "./web-search.types.js";

interface Options { now: () => Date; maxResults: number; staleAfterDays: number }

const listicleTitle = /\b(top\s+\d+|\d+\s+(?:best|top)|attractions?|places?\s+to\s+(?:see|visit)|things\s+to\s+do|ticket\s+prices?|entrance\s+fees?|bảng\s+giá|các\s+điểm\s+du\s+lịch|địa\s+điểm\s+du\s+lịch|không\s+thể\s+bỏ\s+qua)\b/i;
const pricePattern = /(?:\b(VND|KRW|USD|EUR|JPY)\s*([\d][\d.,]*)|([\d][\d.,]*)\s*(VND|KRW|USD|EUR|JPY)\b)/gi;

function normalizedPlaceName(title: string): string {
  return title
    .split(/\s+[|—–]\s+/)[0]!
    .replace(/\s*[:：].*$/, "")
    .replace(/\b(?:official\s+)?(?:admission|entrance|ticket|tickets|price|prices|fee|fees|guide|hours|opening)\b/gi, "")
    .replace(/\b20\d{2}\b/g, "")
    .replace(/[|()[\]_*#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanEvidence(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/[*_`>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isFirstPartySource(placeName: string, hostname: string): boolean {
  if (/\.(?:gov|gov\.[a-z]{2,3}|go\.[a-z]{2,3})$/i.test(hostname)) return true;
  const place = placeName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const host = hostname.toLowerCase().replace(/[^a-z0-9]/g, "");
  return place.length >= 6 && host.includes(place);
}

function hasSingleUnambiguousPrice(text: string, amount: number, currency: string): boolean {
  const matches = [...text.matchAll(pricePattern)];
  const values = new Set(matches.map((match) => {
    const matchedCurrency = (match[1] ?? match[4] ?? "").toUpperCase();
    const rawAmount = match[2] ?? match[3] ?? "";
    const normalizedAmount = matchedCurrency === "VND" || matchedCurrency === "KRW" || matchedCurrency === "JPY"
      ? rawAmount.replace(/[.,]/g, "")
      : rawAmount.replace(/,(?=\d{3}(?:\D|$))/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "");
    return `${matchedCurrency}:${normalizedAmount}`;
  }));
  return values.size === 1 && values.has(`${currency.toUpperCase()}:${amount}`);
}

function dates(start: string, end: string): string[] {
  const values: string[] = [];
  for (let date = new Date(`${start}T00:00:00Z`), last = new Date(`${end}T00:00:00Z`); date <= last; date = new Date(date.getTime() + 86_400_000)) values.push(date.toISOString().slice(0, 10));
  return values;
}

function weekdayFor(date: string): string {
  return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

export class WebSearchService {
  constructor(private readonly provider: WebSearchProvider, private readonly options: Options) {}

  async searchForAgent(input: WebSearchQuery): Promise<{ results: RawWebSearchResult[]; priceCandidates: WebSearchCandidate[] }> {
    const limit = this.options.maxResults;
    const results = (await this.provider.search({ ...input, limit })).slice(0, limit);
    const priceCandidates = results.map((result) => this.normalize(result, input)).filter((result): result is WebSearchCandidate => result !== null).slice(0, limit);
    return { results, priceCandidates };
  }

  private normalize(result: RawWebSearchResult, input: WebSearchQuery): WebSearchCandidate | null {
    if (!Number.isSafeInteger(result.amount) || (result.amount ?? -1) < 0 || !result.currency?.match(/^[A-Za-z]{3}$/)) return null;
    const placeName = normalizedPlaceName(result.name || result.title);
    if (!placeName || listicleTitle.test(result.title) || listicleTitle.test(placeName)) return null;
    const evidence = cleanEvidence(result.excerpt);
    if (!hasSingleUnambiguousPrice(evidence, result.amount!, result.currency!)) return null;
    let parsedUrl: URL;
    try { parsedUrl = new URL(result.url); } catch { return null; }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") return null;
    parsedUrl.hash = "";
    const retrievedAt = result.retrievedAt ? new Date(result.retrievedAt) : this.options.now();
    const stale = !Number.isFinite(retrievedAt.getTime()) || this.options.now().getTime() - retrievedAt.getTime() > this.options.staleAfterDays * 86_400_000;
    const tripDates = dates(input.startDate, input.endDate);
    const closedDates = tripDates.filter((date) => result.closedDates?.includes(date) || result.closedWeekdays?.includes(weekdayFor(date) as Weekday));
    const openDateExists = tripDates.some((date) => result.openingHours?.some((hours) => hours.day === weekdayFor(date)) && !closedDates.includes(date));
    const weather = result.weatherConstraints?.find((condition) => result.expectedWeather?.includes(condition));
    const constraints = [
      ...(closedDates.length ? [`Known closed during trip: ${closedDates.join(", ")}`] : []),
      ...(weather ? [`Known weather constraint: ${weather}`] : []),
      ...(result.seasonConstraints ?? []),
      ...(!result.seasonConstraints?.length ? ["Seasonal restrictions were not confirmed by this result"] : []),
      ...(!result.weatherConstraints?.length ? ["Weather impact was not confirmed; forecast is not a guarantee"] : []),
      ...(!result.openingHours?.length ? ["Opening hours and trip-date opening status could not be verified"] : []),
    ];
    const conflicts = result.conflicts ?? [];
    let confidence = isFirstPartySource(placeName, parsedUrl.hostname) ? 0.72 : 0.48;
    if (stale) confidence -= 0.3;
    if (conflicts.length) confidence -= 0.25;
    return {
      ...result,
      name: placeName,
      excerpt: evidence.slice(0, 360),
      publisher: result.publisher ?? parsedUrl.hostname,
      domain: parsedUrl.hostname.toLowerCase(),
      canonicalUrl: parsedUrl.toString(),
      amountMinor: result.amount!,
      currency: result.currency!.toUpperCase(),
      retrievedAt: Number.isFinite(retrievedAt.getTime()) ? retrievedAt.toISOString() : this.options.now().toISOString(),
      conflicts,
      suitable: openDateExists && !weather,
      constraints,
      confidence: Math.max(0, Math.min(1, confidence)),
      stale,
      verificationStatus: "UNVERIFIED",
    };
  }
}
