import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "./test-app.js";
import { InMemoryTripRepository } from "../src/modules/trips/infrastructure/in-memory-trip.repository.js";
import { TripService } from "../src/modules/trips/trip.service.js";
import { InMemoryPlanningRepository } from "../src/modules/planning/infrastructure/in-memory-planning.repository.js";
import { PlanningService } from "../src/modules/planning/planning.service.js";
import { PlacesService } from "../src/modules/places/places.service.js";
import { PlaceSearchStore } from "../src/modules/places/place-search.store.js";

describe("trip places API", () => {
  async function setup() {
    let id = 0;
    const createId = () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`;
    const now = () => new Date("2026-10-30T00:00:00.000Z");
    const tripRepository = new InMemoryTripRepository();
    const trips = new TripService(tripRepository, { createId, now });
    const trip = await trips.create({ title: "Seoul", customerName: "Client", origin: "SGN", destination: "Seoul", startDate: "2027-04-05", endDate: "2027-04-06", travelers: 2, budgetAmountMinor: 100_000_000, budgetCurrency: "VND" });
    const planning = new PlanningService(tripRepository, new InMemoryPlanningRepository(), { createId, now }, undefined, undefined, "Asia/Ho_Chi_Minh");
    const provider = {
      search: async () => ["place-1", "place-2"].map((googlePlaceId) => ({ googlePlaceId, displayName: googlePlaceId, formattedAddress: "Seoul", latitude: 37.5, longitude: 127 })),
      getDetails: async (googlePlaceId: string) => {
        if (googlePlaceId === "place-2") throw new Error("provider payload secret");
        return { googlePlaceId, displayName: "Google Palace Label", formattedAddress: "Jongno-gu, Seoul", latitude: 37.5796, longitude: 126.977 };
      },
    };
    const places = new PlacesService(provider, new PlaceSearchStore(60_000, 20, () => now().getTime()), trips, 5);
    const app = createTestApp({ tripService: trips, planningService: planning, placesService: places });
    return { app, trip, planning, places };
  }

  it("searches within a trip, saves only the selected ID, and hydrates the selected day", async () => {
    const { app, trip, planning } = await setup();
    const search = await request(app).post(`/api/v1/trips/${trip.id}/places/search`).send({ query: "Gyeongbokgung" });
    expect(search.status).toBe(200);
    const place = search.body.data[0];
    let draft = await planning.getDraft(trip.id);
    draft = await planning.addItineraryItem(trip.id, { expectedRevision: draft.revision, dayIndex: 1, title: "Visit palace", localStartTime: "09:00", localEndTime: "11:00", description: "Historic palace", selectionReason: "Fits the history request", googlePlaceId: place.googlePlaceId });
    const map = await request(app).get(`/api/v1/trips/${trip.id}/itinerary/map?dayIndex=1`);
    expect(map.status).toBe(200);
    expect(map.body.data).toEqual([expect.objectContaining({ activityId: draft.items[0]!.id, status: "resolved", displayName: "Google Palace Label", selectionReason: "Fits the history request" })]);
    expect(draft.items[0]).toMatchObject({ googlePlaceId: "place-1" });
    expect(JSON.stringify(draft)).not.toContain("Jongno-gu");
  });

  it("validates day index and returns unresolved status without leaking provider errors", async () => {
    const { app, trip, planning, places } = await setup();
    const candidates = await places.search(trip.id, "Seoul venue", { tripId: trip.id });
    let draft = await planning.getDraft(trip.id);
    draft = await planning.addItineraryItem(trip.id, { expectedRevision: draft.revision, dayIndex: 1, title: "Other venue", localStartTime: "09:00", localEndTime: "11:00", description: "Visit", googlePlaceId: candidates[1]!.googlePlaceId });
    const badDay = await request(app).get(`/api/v1/trips/${trip.id}/itinerary/map?dayIndex=3`);
    expect(badDay.status).toBe(422);
    const map = await request(app).get(`/api/v1/trips/${trip.id}/itinerary/map?dayIndex=1`);
    expect(map.body.data).toEqual([{ activityId: draft.items[0]!.id, status: "unresolved" }]);
    expect(JSON.stringify(map.body)).not.toContain("provider payload secret");
  });
});
