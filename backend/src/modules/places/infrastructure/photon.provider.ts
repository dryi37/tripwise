import { ApiError } from "../../../shared/http/api-error.js";
import { appLogger } from "../../../shared/observability/agent-logger.js";
import type { DestinationRecord, PlaceRecord, PlacesProvider } from "../places.types.js";

interface PhotonFeature {
  properties?: {
    name?: unknown;
    street?: unknown;
    housenumber?: unknown;
    district?: unknown;
    city?: unknown;
    county?: unknown;
    state?: unknown;
    country?: unknown;
    countrycode?: unknown;
    osm_type?: unknown;
    osm_id?: unknown;
    osm_value?: unknown;
  };
  geometry?: { coordinates?: unknown };
}

interface PhotonResponse { features?: unknown; }

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

function parseFeature(feature: PhotonFeature): PlaceRecord | null {
  const properties = feature.properties;
  const osmType = text(properties?.osm_type).toLowerCase();
  const typeById: Record<string, string> = { n: "node", w: "way", r: "relation", node: "node", way: "way", relation: "relation" };
  const placeType = typeById[osmType];
  const osmId = typeof properties?.osm_id === "number" || typeof properties?.osm_id === "string" ? String(properties.osm_id) : "";
  const coordinates = feature.geometry?.coordinates;
  const longitude = Array.isArray(coordinates) ? coordinates[0] : undefined;
  const latitude = Array.isArray(coordinates) ? coordinates[1] : undefined;
  const displayName = text(properties?.name) || [text(properties?.street), text(properties?.housenumber), text(properties?.district), text(properties?.city), text(properties?.country)].filter(Boolean).slice(0, 2).join(" ");
  const addressParts = [text(properties?.street) && [text(properties?.housenumber), text(properties?.street)].filter(Boolean).join(" "), text(properties?.district), text(properties?.city), text(properties?.county), text(properties?.state), text(properties?.country)].filter((part, index, all) => Boolean(part) && all.indexOf(part) === index);
  const formattedAddress = addressParts.length ? addressParts.join(", ") : displayName;
  if (!placeType || !/^\d+$/.test(osmId) || !displayName || !formattedAddress
    || typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;

  return {
    placeProvider: "OPENSTREETMAP",
    placeId: `${placeType}/${osmId}`,
    displayName,
    formattedAddress,
    latitude,
    longitude,
    ...(text(properties?.osm_value) ? { primaryType: text(properties?.osm_value).toLowerCase() } : {}),
  };
}

export class PhotonProvider implements PlacesProvider {
  private readonly resultCache = new Map<string, { results: PlaceRecord[]; expiresAt: number }>();
  private readonly destinationCache = new Map<string, { center: { latitude: number; longitude: number } | undefined; expiresAt: number }>();
  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(private readonly apiUrl: string, private readonly timeoutMs: number, private readonly cacheTtlMs: number, private readonly maxCachedQueries = 500) {}

  private async destinationFeatures(url: URL, signal?: AbortSignal): Promise<PhotonFeature[]> {
    return this.fetchFeatures(url, "destination_search", signal);
  }

  private async fetchFeatures(url: URL, operation: "destination_search" | "venue_search", signal?: AbortSignal): Promise<PhotonFeature[]> {
    const startedAt = Date.now();
    appLogger.info({ event: "provider.request.started", provider: "photon", operation, queryLength: url.searchParams.get("q")?.length ?? 0 });
    let response: Response;
    try {
      response = await this.enqueue(() => fetch(url, {
        headers: { "user-agent": "Tripwise travel planner" },
        signal: AbortSignal.any([AbortSignal.timeout(this.timeoutMs), ...(signal ? [signal] : [])]),
      }), signal);
    } catch (error) {
      appLogger.warn({ event: "provider.request.failed", provider: "photon", operation, durationMs: Date.now() - startedAt, errorName: error instanceof Error ? error.name : "UNKNOWN_ERROR", timedOut: error instanceof DOMException && error.name === "TimeoutError" });
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ApiError(503, "PLACE_LOOKUP_UNAVAILABLE", "OpenStreetMap search is temporarily unavailable");
    }
    if (!response.ok) {
      appLogger.warn({ event: "provider.request.failed", provider: "photon", operation, status: response.status, durationMs: Date.now() - startedAt });
      throw new ApiError(503, "PLACE_LOOKUP_UNAVAILABLE", `OpenStreetMap search is temporarily unavailable (${response.status})`);
    }
    let payload: PhotonResponse;
    try { payload = await response.json() as PhotonResponse; }
    catch {
      appLogger.warn({ event: "provider.response.invalid", provider: "photon", operation, reason: "INVALID_JSON", durationMs: Date.now() - startedAt });
      throw new ApiError(503, "PLACE_LOOKUP_UNAVAILABLE", "OpenStreetMap returned an invalid search response");
    }
    if (!Array.isArray(payload.features)) {
      appLogger.warn({ event: "provider.response.invalid", provider: "photon", operation, reason: "FEATURES_MISSING", durationMs: Date.now() - startedAt });
      throw new ApiError(503, "PLACE_LOOKUP_UNAVAILABLE", "OpenStreetMap returned an invalid search response");
    }
    appLogger.info({ event: "provider.request.completed", provider: "photon", operation, status: response.status, resultCount: payload.features.length, durationMs: Date.now() - startedAt });
    return payload.features as PhotonFeature[];
  }

  async searchDestinations(query: string, limit: number, signal?: AbortSignal): Promise<DestinationRecord[]> {
    const normalized = query.trim();
    if (normalized.length < 2) return [];
    const url = new URL("api/", this.apiUrl.endsWith("/") ? this.apiUrl : `${this.apiUrl}/`);
    url.searchParams.set("q", normalized);
    url.searchParams.set("limit", String(Math.max(1, Math.min(10, Math.floor(limit)))));
    url.searchParams.set("lang", "en");
    url.searchParams.append("layer", "city");
    const normalizedQuery = normalized.toLocaleLowerCase("en");
    const features = await this.destinationFeatures(url, signal);
    const destinations: DestinationRecord[] = [];
    const seen = new Set<string>();
    for (const item of features) {
      const properties = item.properties;
      const countryCode = text(properties?.countrycode).toUpperCase();
      if (!/^[A-Z]{2}$/.test(countryCode)) continue;
      if (text(properties?.osm_value).toLowerCase() === "country") continue;
      const city = text(properties?.name);
      const country = text(properties?.country);
      const key = `city:${city.toLocaleLowerCase("en")},${countryCode}`;
      if (!city || !country || seen.has(key)) continue;
      seen.add(key);
      destinations.push({ type: "city", destination: `${city}, ${country}`, city, country, countryCode });
    }
    const relevance = (destination: DestinationRecord): number => {
      const normalizedNames = [destination.city, destination.country].map((name) => name.toLocaleLowerCase("en"));
      if (normalizedNames.some((name) => name === normalizedQuery)) return 0;
      if (normalizedNames.some((name) => name.startsWith(normalizedQuery))) return 1;
      if (normalizedNames.some((name) => name.includes(normalizedQuery))) return 2;
      return 3;
    };
    return destinations
      .map((destination, index) => ({ destination, index, score: relevance(destination) }))
      .sort((left, right) => left.score - right.score || left.index - right.index)
      .slice(0, Math.max(1, Math.min(10, Math.floor(limit))))
      .map(({ destination }) => destination);
  }

  async search(query: string, destination: string, limit: number, signal?: AbortSignal): Promise<PlaceRecord[]> {
    // Trip destinations are commonly stored as "Seoul, Hàn Quốc". Photon
    // searches multilingual names, but appending a differently localized
    // country name can suppress otherwise exact venue matches. The city-level
    // context is enough to disambiguate without polluting the query.
    const destinationContext = destination.split(",", 1)[0]?.trim() ?? "";
    const textQuery = [query.trim(), destinationContext].filter(Boolean).join(", ");
    const cacheKey = textQuery.toLocaleLowerCase("vi");
    const cached = this.resultCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      appLogger.info({ event: "provider.cache.hit", provider: "photon", operation: "venue_search", resultCount: cached.results.length });
      return cached.results.map((place) => ({ ...place }));
    }
    if (cached) this.resultCache.delete(cacheKey);

    const center = destinationContext ? await this.destinationCenter(destinationContext, signal) : undefined;
    const url = new URL("api/", this.apiUrl.endsWith("/") ? this.apiUrl : `${this.apiUrl}/`);
    url.searchParams.set("q", textQuery);
    url.searchParams.set("limit", String(Math.max(1, Math.min(20, Math.floor(limit)))));
    url.searchParams.set("lang", "en");
    if (center) {
      url.searchParams.set("lat", String(center.latitude));
      url.searchParams.set("lon", String(center.longitude));
      url.searchParams.set("zoom", "11");
      url.searchParams.set("location_bias_scale", "0.2");
    }

    const features = await this.fetchFeatures(url, "venue_search", signal);
    const results = features.map((feature) => parseFeature(feature as PhotonFeature))
      .filter((place): place is PlaceRecord => place !== null)
      .filter((place) => !center || !destination.includes(",") || this.distanceKm(center, place) <= 80);
    while (this.resultCache.size >= this.maxCachedQueries) {
      const oldest = this.resultCache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.resultCache.delete(oldest);
    }
    this.resultCache.set(cacheKey, { results: results.map((place) => ({ ...place })), expiresAt: Date.now() + this.cacheTtlMs });
    return results;
  }

  async isWithinDestination(destination: string, location: { latitude: number; longitude: number }): Promise<boolean> {
    if (!destination.includes(",")) return true;
    const context = destination.split(",", 1)[0]?.trim() ?? "";
    if (!context) return true;
    const center = await this.destinationCenter(context);
    return !center || this.distanceKm(center, location) <= 80;
  }

  async getDestinationCenter(destination: string): Promise<{ latitude: number; longitude: number } | undefined> {
    const context = destination.split(",", 1)[0]?.trim() ?? "";
    return context ? this.destinationCenter(context) : undefined;
  }

  private async destinationCenter(destination: string, signal?: AbortSignal): Promise<{ latitude: number; longitude: number } | undefined> {
    const key = destination.toLocaleLowerCase("vi");
    const cached = this.destinationCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      appLogger.info({ event: "provider.cache.hit", provider: "photon", operation: "destination_center", hasCenter: cached.center !== undefined });
      return cached.center;
    }

    const url = new URL("api/", this.apiUrl.endsWith("/") ? this.apiUrl : `${this.apiUrl}/`);
    url.searchParams.set("q", destination);
    url.searchParams.set("limit", "1");
    url.searchParams.set("lang", "en");
    url.searchParams.set("layer", "city");
    let center: { latitude: number; longitude: number } | undefined;
    const startedAt = Date.now();
    appLogger.info({ event: "provider.request.started", provider: "photon", operation: "destination_center", queryLength: destination.length });
    try {
      const response = await this.enqueue(() => fetch(url, {
        headers: { "user-agent": "Tripwise travel planner" },
        signal: AbortSignal.any([AbortSignal.timeout(this.timeoutMs), ...(signal ? [signal] : [])]),
      }), signal);
      if (response.ok) {
        const payload = await response.json() as PhotonResponse;
        const first = Array.isArray(payload.features) ? payload.features[0] as PhotonFeature | undefined : undefined;
        const coordinates = first?.geometry?.coordinates;
        const longitude = Array.isArray(coordinates) ? coordinates[0] : undefined;
        const latitude = Array.isArray(coordinates) ? coordinates[1] : undefined;
        if (typeof latitude === "number" && Number.isFinite(latitude) && typeof longitude === "number" && Number.isFinite(longitude)) center = { latitude, longitude };
      }
      if (!response.ok) appLogger.warn({ event: "provider.request.failed", provider: "photon", operation: "destination_center", status: response.status, durationMs: Date.now() - startedAt });
      else appLogger.info({ event: "provider.request.completed", provider: "photon", operation: "destination_center", status: response.status, resultCount: center ? 1 : 0, durationMs: Date.now() - startedAt });
    } catch (error) {
      appLogger.warn({ event: "provider.request.failed", provider: "photon", operation: "destination_center", durationMs: Date.now() - startedAt, errorName: error instanceof Error ? error.name : "UNKNOWN_ERROR" });
      if (signal?.aborted) throw error;
    }
    while (this.destinationCache.size >= this.maxCachedQueries) {
      const oldest = this.destinationCache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.destinationCache.delete(oldest);
    }
    this.destinationCache.set(key, { center, expiresAt: Date.now() + this.cacheTtlMs });
    return center;
  }

  private distanceKm(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): number {
    const radians = (degrees: number) => degrees * Math.PI / 180;
    const dLat = radians(to.latitude - from.latitude);
    const dLon = radians(to.longitude - from.longitude);
    const value = Math.sin(dLat / 2) ** 2
      + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLon / 2) ** 2;
    return 6_371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  private async enqueue<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const current = this.queue.then(async () => {
      if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
      const delayMs = Math.max(0, 1_000 - (Date.now() - this.lastRequestAt));
      if (delayMs > 0) await this.wait(delayMs, signal);
      if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
      this.lastRequestAt = Date.now();
      return operation();
    });
    this.queue = current.then(() => undefined, () => undefined);
    return current;
  }

  private async wait(delayMs: number, signal?: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const done = () => { signal?.removeEventListener("abort", abort); resolve(); };
      const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(new DOMException("The operation was aborted", "AbortError")); };
      timer = setTimeout(done, delayMs);
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
  }
}
