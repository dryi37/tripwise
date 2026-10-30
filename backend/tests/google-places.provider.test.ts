import { afterEach, describe, expect, it, vi } from "vitest";
import { GooglePlacesProvider } from "../src/modules/places/infrastructure/google-places.provider.js";

afterEach(() => vi.unstubAllGlobals());

describe("GooglePlacesProvider", () => {
  it("sends minimal field masks and parses a search result", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit) => new Response(JSON.stringify({ places: [{ id: "ChIJ1", displayName: { text: "Palace" }, formattedAddress: "Seoul", location: { latitude: 37, longitude: 127 }, primaryType: "museum" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GooglePlacesProvider("secret", "https://places.googleapis.com/v1", 1000);
    expect(await provider.search("palace", "Seoul")).toMatchObject([{ googlePlaceId: "ChIJ1", displayName: "Palace", latitude: 37 }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("places:searchText");
    expect(new Headers(init?.headers).get("X-Goog-Api-Key")).toBe("secret");
    expect(new Headers(init?.headers).get("X-Goog-FieldMask")).toContain("places.location");
    expect(new Headers(init?.headers).get("X-Goog-FieldMask")).not.toContain("photos");
    expect(JSON.parse(String(init?.body))).toMatchObject({ maxResultCount: 5 });
  });

  it("rejects malformed responses and normalizes provider failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ places: [{ id: "bad", location: { latitude: 999, longitude: 1 } }] }), { status: 200 })));
    const provider = new GooglePlacesProvider("secret", "https://places.googleapis.com/v1", 1000);
    await expect(provider.search("palace", "Seoul")).rejects.toMatchObject({ code: "PLACE_LOOKUP_UNAVAILABLE" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 429 })));
    await expect(provider.search("palace", "Seoul")).rejects.toMatchObject({ code: "PLACE_LOOKUP_UNAVAILABLE", status: 503 });
  });
});
