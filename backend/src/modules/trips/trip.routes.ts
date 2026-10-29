import { Router } from "express";

import { validate } from "../../middleware/validate.middleware.js";
import { TripController } from "./trip.controller.js";
import {
  createTripRequestSchema,
  getTripRequestSchema,
  listTripsRequestSchema,
  updateTripRequestSchema,
} from "./trip.schemas.js";
import type { TripService } from "./trip.service.js";

export function createTripRouter(service: TripService): Router {
  const router = Router();
  const controller = new TripController(service);

  router.post("/", validate(createTripRequestSchema), controller.create);
  router.get("/", validate(listTripsRequestSchema), controller.list);
  router.get("/:tripId", validate(getTripRequestSchema), controller.get);
  router.patch("/:tripId", validate(updateTripRequestSchema), controller.update);

  return router;
}
