import { ApiError } from "../../shared/http/api-error.js";
import type { DestinationRecord, PlaceRecord, PlaceSearchScope, PlacesProvider } from "./places.types.js";
import { PlaceSearchStore } from "./place-search.store.js";

const genericPlaceTypes = new Set(["country", "locality", "administrative", "administrative_area_level_1", "administrative_area_level_2", "postal_code", "postcode", "road", "route", "city", "town", "village", "state", "county", "neighbourhood", "suburb"]);

export interface PlacesTripLookup {
  get(id: string): Promise<{ id: string; destination: string }>;
}

export class PlacesService {
  constructor(private readonly provider: PlacesProvider, private readonly searches: PlaceSearchStore, private readonly trips: PlacesTripLookup, private readonly maxResults: number) {}

  async searchDestinations(query: string, signal?: AbortSignal): Promise<DestinationRecord[]> {
    const normalized = query.trim();
    if (normalized.length < 2 || normalized.length > 160) throw new ApiError(422, "INVALID_DESTINATION_QUERY", "Destination search must be between 2 and 160 characters");
    if (!this.provider.searchDestinations) throw new ApiError(503, "PLACE_LOOKUP_UNAVAILABLE", "Destination search is temporarily unavailable");
    return this.provider.searchDestinations(normalized, 8, signal);
  }

  async search(tripId: string, query: string, scope: PlaceSearchScope, signal?: AbortSignal): Promise<PlaceRecord[]> {
    const trip = await this.trips.get(tripId);
    if (scope.tripId !== tripId) throw new ApiError(403, "PLACE_SCOPE_MISMATCH", "The place selection belongs to another trip");
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2 || normalizedQuery.length > 160) throw new ApiError(422, "INVALID_PLACE_QUERY", "Search query must be between 2 and 160 characters");
    const results = await this.provider.search(normalizedQuery, trip.destination, this.maxResults, signal);
    const places: PlaceRecord[] = [];
    const seen = new Set<string>();
    for (const result of results) {
      if (!result.placeId || seen.has(result.placeId) || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) continue;
      seen.add(result.placeId);
      if (genericPlaceTypes.has(result.primaryType ?? "")) continue;
      this.searches.remember(result, scope);
      places.push(result);
      if (places.length >= this.maxResults) break;
    }
    return places;
  }

  resolvePlaceId(placeId: string, scope: PlaceSearchScope): PlaceRecord {
    if (!placeId.trim()) throw new ApiError(422, "PLACE_REQUIRED", "Choose a specific OpenStreetMap place before adding this activity");
    return this.searches.resolvePlaceId(placeId, scope);
  }

  async isWithinDestination(destination: string, location: { latitude: number; longitude: number }): Promise<boolean> {
    return this.provider.isWithinDestination ? this.provider.isWithinDestination(destination, location) : true;
  }

  async getDestinationCenter(destination: string): Promise<{ latitude: number; longitude: number } | undefined> {
    return this.provider.getDestinationCenter ? this.provider.getDestinationCenter(destination) : undefined;
  }
}
