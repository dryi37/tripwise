import { Router } from "express";
import { randomUUID } from "node:crypto";
import { validate } from "../../middleware/validate.middleware.js";
import type { PlacesService } from "./places.service.js";
import { destinationSearchSchema, mapPlacesSchema, searchPlacesSchema, type DestinationSearchRequest } from "./places.schemas.js";
import { PlacesController } from "./places.controller.js";
import type { PlanningService } from "../planning/planning.service.js";
import type { TripService } from "../trips/trip.service.js";

export function createPlacesRouter(service: PlacesService, planning: PlanningService, trips: TripService, rateLimit: { maxRequests: number; windowMs: number }): Router {
  const router = Router({ mergeParams: true });
  const controller = new PlacesController(service, planning, trips);
  const windows = new Map<string, { count: number; resetsAt: number }>();
  const limit = (request: import("express").Request, response: import("express").Response, next: import("express").NextFunction) => {
    const now = Date.now();
    for (const [address, entry] of windows) if (entry.resetsAt <= now) windows.delete(address);
    const key = request.ip ?? request.socket.remoteAddress ?? "unknown";
    const current = windows.get(key);
    const window = !current || current.resetsAt <= now ? { count: 0, resetsAt: now + rateLimit.windowMs } : current;
    window.count += 1;
    windows.set(key, window);
    if (window.count > rateLimit.maxRequests) {
      response.setHeader("Retry-After", Math.max(1, Math.ceil((window.resetsAt - now) / 1_000)));
      response.status(429).json({ error: { code: "PLACES_RATE_LIMITED", message: "Too many place searches" } });
      return;
    }
    next();
  };
  router.post("/places/search", limit, validate(searchPlacesSchema), controller.search);
  router.get("/itinerary/map", limit, validate(mapPlacesSchema), controller.map);
  return router;
}

export function createDestinationSearchRouter(service: PlacesService, rateLimit: { maxRequests: number; windowMs: number }): Router {
  const router = Router();
  const windows = new Map<string, { count: number; resetsAt: number }>();
  router.post("/destinations/search", (request, response, next) => {
    const now = Date.now();
    for (const [address, entry] of windows) if (entry.resetsAt <= now) windows.delete(address);
    const key = request.ip ?? request.socket.remoteAddress ?? "unknown";
    const current = windows.get(key);
    const window = !current || current.resetsAt <= now ? { count: 0, resetsAt: now + rateLimit.windowMs } : current;
    window.count += 1;
    windows.set(key, window);
    if (window.count > rateLimit.maxRequests) {
      response.setHeader("Retry-After", Math.max(1, Math.ceil((window.resetsAt - now) / 1_000)));
      response.status(429).json({ error: { code: "PLACES_RATE_LIMITED", message: "Too many place searches" } });
      return;
    }
    next();
  }, validate(destinationSearchSchema), async (request, response) => {
    const input = response.locals.validated as DestinationSearchRequest;
    const abort = new AbortController();
    request.once("aborted", () => abort.abort());
    const candidates = await service.searchDestinations(input.body.query, abort.signal);
    response.json({ data: candidates, requestId: randomUUID() });
  });
  return router;
}
