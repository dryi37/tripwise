export interface PlaceSearchInput {
  query: string;
  destination: string;
  limit: number;
  tripId: string;
  runId?: string;
}

export interface PlaceRecord {
  placeProvider: "OPENSTREETMAP";
  placeId: string;
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  primaryType?: string;
}

export interface DestinationRecord {
  type: "city";
  destination: string;
  city: string;
  country: string;
  countryCode: string;
}

export interface PlaceSearchScope {
  tripId: string;
  runId?: string;
}

export interface PlacesProvider {
  search(query: string, destination: string, limit: number, signal?: AbortSignal): Promise<PlaceRecord[]>;
  searchDestinations?(query: string, limit: number, signal?: AbortSignal): Promise<DestinationRecord[]>;
  isWithinDestination?(destination: string, location: Pick<PlaceRecord, "latitude" | "longitude">): Promise<boolean>;
  getDestinationCenter?(destination: string): Promise<Pick<PlaceRecord, "latitude" | "longitude"> | undefined>;
}
