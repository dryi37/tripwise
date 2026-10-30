import { ApiError } from "../../shared/http/api-error.js";
import type { PlaceRecord, PlaceSearchScope } from "./places.types.js";

interface SearchEntry {
  place: PlaceRecord;
  scope: PlaceSearchScope;
  expiresAt: number;
}

function key(placeId: string, scope: PlaceSearchScope): string {
  return JSON.stringify([scope.tripId, scope.runId ?? null, placeId]);
}

export class PlaceSearchStore {
  private readonly entries = new Map<string, SearchEntry>();

  constructor(private readonly ttlMs: number, private readonly maxEntries: number, private readonly now: () => number = Date.now) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || !Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
      throw new Error("Place search TTL and capacity must be positive integers");
    }
  }

  remember(place: PlaceRecord, scope: PlaceSearchScope): void {
    this.pruneExpired();
    const id = key(place.placeId, scope);
    if (!this.entries.has(id)) {
      while (this.entries.size >= this.maxEntries) {
        const oldestId = this.entries.keys().next().value as string | undefined;
        if (!oldestId) break;
        this.entries.delete(oldestId);
      }
    }
    this.entries.delete(id);
    this.entries.set(id, { place: { ...place }, scope: { ...scope }, expiresAt: this.now() + this.ttlMs });
  }

  resolvePlaceId(placeId: string, scope: PlaceSearchScope): PlaceRecord {
    this.pruneExpired();
    const entry = this.entries.get(key(placeId, scope));
    if (entry) return { ...entry.place };
    if ([...this.entries.values()].some((candidate) => candidate.place.placeId === placeId)) {
      throw new ApiError(403, "PLACE_SCOPE_MISMATCH", "The selected place was not searched for this trip or agent run");
    }
    throw new ApiError(410, "PLACE_SELECTION_EXPIRED", "Search for the place again and select it");
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [id, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(id);
  }
}
