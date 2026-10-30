import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";

import type { SearchPlacesRequest } from "./places.schemas.js";
import type { PlacesService } from "./places.service.js";
import type { PlanningService } from "../planning/planning.service.js";
import type { MapPlacesRequest } from "./places.schemas.js";
import type { TripService } from "../trips/trip.service.js";
import { ApiError } from "../../shared/http/api-error.js";

export class PlacesController {
  constructor(private readonly service: PlacesService, private readonly planning: PlanningService, private readonly trips: TripService) {}

  search: RequestHandler = async (request, response) => {
    const input = response.locals.validated as SearchPlacesRequest;
    const header = request.get("X-Client-Run-Id");
    const runId = header && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(header) ? header : undefined;
    const abort = new AbortController();
    request.once("aborted", () => abort.abort());
    const candidates = await this.service.search(input.params.tripId, input.body.query, { tripId: input.params.tripId, ...(runId ? { runId } : {}) }, abort.signal);
    response.json({ data: candidates, requestId: randomUUID() });
  };

  map: RequestHandler = async (request, response) => {
    const input = response.locals.validated as MapPlacesRequest;
    const trip = await this.trips.get(input.params.tripId);
    const maxDay = Math.floor((Date.parse(`${trip.endDate}T00:00:00Z`) - Date.parse(`${trip.startDate}T00:00:00Z`)) / 86_400_000) + 1;
    if (input.query.dayIndex > maxDay) throw new ApiError(422, "INVALID_DAY_INDEX", `dayIndex must be between 1 and ${maxDay}`);
    const draft = await this.planning.getDraft(input.params.tripId);
    const selected = draft.items.filter((item) => item.dayIndex === input.query.dayIndex);
    const hydrated = await Promise.all(selected.map(async (item) => {
      const resolved = item.placeProvider === "OPENSTREETMAP" && item.placeId && item.placeName && item.placeAddress
        && Number.isFinite(item.placeLatitude) && Number.isFinite(item.placeLongitude);
      if (!resolved) return { activityId: item.id, status: "unresolved" };
      if (!await this.service.isWithinDestination(trip.destination, { latitude: item.placeLatitude!, longitude: item.placeLongitude! })) {
        return { activityId: item.id, status: "outside_destination" };
      }
      return {
            activityId: item.id,
            placeProvider: item.placeProvider,
            placeId: item.placeId,
            status: "resolved",
            displayName: item.placeName,
            formattedAddress: item.placeAddress,
            openStreetMapUri: `https://www.openstreetmap.org/${item.placeId}`,
            latitude: item.placeLatitude,
            longitude: item.placeLongitude,
            selectionReason: item.selectionReason ?? "",
          };
    }));
    const center = await this.service.getDestinationCenter(trip.destination);
    response.json({ data: hydrated, ...(center ? { center: { latitude: center.latitude, longitude: center.longitude } } : {}), requestId: randomUUID() });
  };
}
