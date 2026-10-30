import { describe, expect, it } from "vitest";
import { PlaceSearchStore } from "../src/modules/places/place-search.store.js";
import { PlacesService } from "../src/modules/places/places.service.js";
import type { GooglePlaceRecord, PlacesProvider } from "../src/modules/places/places.types.js";

const place = (id: string, primaryType?: string): GooglePlaceRecord => ({ googlePlaceId: id, displayName: id, formattedAddress: "Seoul, South Korea", latitude: 37, longitude: 127, ...(primaryType ? { primaryType } : {}) });

describe("PlacesService", () => {
  it("uses trip destination, filters generic/closed places, deduplicates IDs, and caps results", async () => {
    let calledWith: string[] = [];
    const results = [place("locality", "locality"), place("closed").businessStatus === "CLOSED_PERMANENTLY" ? place("closed") : { ...place("closed"), businessStatus: "CLOSED_PERMANENTLY" }, place("one"), place("one"), place("two")];
    const provider: PlacesProvider = { search: async (query, destination) => { calledWith = [query, destination]; return results; }, getDetails: async (id) => place(id) };
    const service = new PlacesService(provider, new PlaceSearchStore(1000, 20, () => 1), { get: async (id) => ({ id, destination: "Seoul" }) }, 1);
    const found = await service.search("trip", "  palace  ", { tripId: "trip", runId: "run" });
    expect(calledWith).toEqual(["palace", "Seoul"]);
    expect(found.map((item) => item.googlePlaceId)).toEqual(["one"]);
    expect(service.resolvePlaceId(found[0]!.googlePlaceId, { tripId: "trip", runId: "run" }).googlePlaceId).toBe("one");
  });

  it("rejects query text that is too short", async () => {
    const provider: PlacesProvider = { search: async () => [], getDetails: async (id) => place(id) };
    const service = new PlacesService(provider, new PlaceSearchStore(1000, 2), { get: async (id) => ({ id, destination: "Seoul" }) }, 2);
    await expect(service.search("trip", "x", { tripId: "trip" })).rejects.toMatchObject({ code: "INVALID_PLACE_QUERY" });
  });
});
