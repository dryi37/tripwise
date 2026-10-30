import { z } from "zod";

import { ApiError } from "../../shared/http/api-error.js";
import { appLogger } from "../../shared/observability/agent-logger.js";

export interface ExchangeRate {
  base: string;
  quote: string;
  rate: number;
  date: string;
  provider: string;
}

export interface ExchangeRateProvider {
  getRate(base: string, quote: string): Promise<ExchangeRate>;
}

const responseSchema = z.object({
  base: z.string().regex(/^[A-Z]{3}$/),
  quote: z.string().regex(/^[A-Z]{3}$/),
  rate: z.number().positive().finite(),
  date: z.iso.date(),
});

export class FrankfurterExchangeRateProvider implements ExchangeRateProvider {
  private readonly cache = new Map<string, { value: ExchangeRate; expiresAt: number }>();

  constructor(private readonly baseUrl: string, private readonly timeoutMs: number, private readonly cacheTtlMs: number) {}

  async getRate(base: string, quote: string): Promise<ExchangeRate> {
    const normalizedBase = base.toUpperCase();
    const normalizedQuote = quote.toUpperCase();
    if (normalizedBase === normalizedQuote) {
      return { base: normalizedBase, quote: normalizedQuote, rate: 1, date: new Date().toISOString().slice(0, 10), provider: "identity" };
    }

    const key = `${normalizedBase}:${normalizedQuote}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const startedAt = Date.now();
    let status: number | undefined;
    appLogger.info({ event: "provider.request.started", provider: "frankfurter", operation: "exchange_rate", base: normalizedBase, quote: normalizedQuote });
    try {
      const root = this.baseUrl.replace(/\/+$/, "");
      const response = await fetch(`${root}/rate/${encodeURIComponent(normalizedBase)}/${encodeURIComponent(normalizedQuote)}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      status = response.status;
      if (!response.ok) throw new Error("Exchange-rate provider returned a non-success status");
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success || parsed.data.base !== normalizedBase || parsed.data.quote !== normalizedQuote) {
        throw new Error("Exchange-rate provider returned an invalid currency pair");
      }
      const value: ExchangeRate = { ...parsed.data, provider: "Frankfurter" };
      this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
      appLogger.info({ event: "provider.request.completed", provider: "frankfurter", operation: "exchange_rate", status, base: normalizedBase, quote: normalizedQuote, rateDate: value.date, durationMs: Date.now() - startedAt });
      return value;
    } catch (error) {
      appLogger.warn({ event: "provider.request.failed", provider: "frankfurter", operation: "exchange_rate", ...(status === undefined ? {} : { status }), base: normalizedBase, quote: normalizedQuote, errorName: error instanceof Error ? error.name : "UNKNOWN_ERROR", durationMs: Date.now() - startedAt });
      throw new ApiError(503, "EXCHANGE_RATE_UNAVAILABLE", `Could not retrieve the ${normalizedBase}/${normalizedQuote} exchange rate`);
    }
  }
}

export function currencyMinorUnitFactor(currency: string): number {
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 0;
    return 10 ** digits;
  } catch {
    throw new ApiError(422, "INVALID_CURRENCY", `Unsupported currency code: ${currency}`);
  }
}

export function majorAmountToMinor(amount: number, currency: string): number {
  if (!Number.isFinite(amount) || amount < 0) throw new ApiError(422, "INVALID_AMOUNT", "Price must be a finite non-negative amount");
  const amountMinor = Math.round(amount * currencyMinorUnitFactor(currency));
  if (!Number.isSafeInteger(amountMinor)) throw new ApiError(422, "AMOUNT_OVERFLOW", "Price exceeds the supported range");
  return amountMinor;
}

export function convertMinorAmount(amountMinor: number, base: string, quote: string, rate: number): number {
  const converted = Math.round((amountMinor / currencyMinorUnitFactor(base)) * rate * currencyMinorUnitFactor(quote));
  if (!Number.isSafeInteger(converted) || converted < 0) throw new ApiError(422, "AMOUNT_OVERFLOW", "Converted quote amount exceeds the supported range");
  return converted;
}
