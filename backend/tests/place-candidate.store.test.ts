import { describe, expect, it } from "vitest";
import { PlaceSearchStore } from "../src/modules/places/place-search.store.js";

const place = { googlePlaceId: "ChIJ1", displayName: "Palace", formattedAddress: "Seoul", latitude: 37, longitude: 127 };

describe("PlaceSearchStore", () => {
  it("accepts Place IDs only for the trip and agent run where they were searched", () => {
    const store = new PlaceSearchStore(100, 10, () => 0);
    store.remember(place, { tripId: "trip-a", runId: "run-a" });
    expect(store.resolvePlaceId("ChIJ1", { tripId: "trip-a", runId: "run-a" })).toEqual(place);
    expect(() => store.resolvePlaceId("ChIJ1", { tripId: "trip-b", runId: "run-a" })).toThrowError(expect.objectContaining({ code: "PLACE_SCOPE_MISMATCH" }));
    expect(() => store.resolvePlaceId("ChIJ1", { tripId: "trip-a", runId: "run-b" })).toThrowError(expect.objectContaining({ code: "PLACE_SCOPE_MISMATCH" }));
  });

  it("expires selections and evicts the oldest search result at capacity", () => {
    let now = 0;
    const store = new PlaceSearchStore(10, 1, () => now);
    store.remember(place, { tripId: "trip" });
    store.remember({ ...place, googlePlaceId: "ChIJ2" }, { tripId: "trip" });
    expect(() => store.resolvePlaceId("ChIJ1", { tripId: "trip" })).toThrowError(expect.objectContaining({ code: "PLACE_SELECTION_EXPIRED" }));
    now = 10;
    expect(() => store.resolvePlaceId("ChIJ2", { tripId: "trip" })).toThrowError(expect.objectContaining({ code: "PLACE_SELECTION_EXPIRED" }));
  });
});
