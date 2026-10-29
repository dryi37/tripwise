import { Router } from "express";

import { validate } from "../../middleware/validate.middleware.js";
import { PlanningController } from "./planning.controller.js";
import {
  createItineraryItemSchema,
  createQuoteItemSchema,
  createQuoteItemFromOfferSchema,
  createManualQuoteItemSchema,
  deletePlanningItemSchema,
  getPlanningSchema,
  updateItineraryItemSchema,
  updateQuoteItemSchema,
} from "./planning.schemas.js";
import type { PlanningService } from "./planning.service.js";
import type { IdempotencyService } from "../../shared/idempotency/idempotency.service.js";

export function createPlanningRouter(service: PlanningService, idempotency?: IdempotencyService): Router {
  const router = Router({ mergeParams: true });
  const controller = new PlanningController(service, idempotency);
  router.get("/draft", validate(getPlanningSchema), controller.getDraft);
  router.post("/draft/items", validate(createItineraryItemSchema), controller.addItineraryItem);
  router.patch("/draft/items/:itemId", validate(updateItineraryItemSchema), controller.updateItineraryItem);
  router.delete("/draft/items/:itemId", validate(deletePlanningItemSchema), controller.deleteItineraryItem);
  router.get("/draft/quote", validate(getPlanningSchema), controller.getQuote);
  router.post("/draft/quote/items", validate(createQuoteItemSchema), controller.addQuoteItem);
  router.post("/draft/quote/items/from-offer", validate(createQuoteItemFromOfferSchema), controller.addQuoteItemFromOffer);
  router.post("/draft/quote/items/manual", validate(createManualQuoteItemSchema), controller.addManualQuoteItem);
  router.patch("/draft/quote/items/:itemId", validate(updateQuoteItemSchema), controller.updateQuoteItem);
  router.delete("/draft/quote/items/:itemId", validate(deletePlanningItemSchema), controller.deleteQuoteItem);
  return router;
}
