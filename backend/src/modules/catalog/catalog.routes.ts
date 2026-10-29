import { Router } from "express";
import { validate } from "../../middleware/validate.middleware.js";
import { CatalogController } from "./catalog.controller.js";
import { createOfferSchema, createServiceSchema, deleteServiceSchema, listCatalogSchema, updateOfferSchema, updateServiceSchema } from "./catalog.schemas.js";
import type { CatalogService } from "./catalog.service.js";
export function createCatalogRouter(service: CatalogService): Router {
  const router = Router(); const controller = new CatalogController(service);
  router.get("/services", validate(listCatalogSchema), controller.list);
  router.post("/services", validate(createServiceSchema), controller.createService);
  router.patch("/services/:serviceId", validate(updateServiceSchema), controller.updateService);
  router.delete("/services/:serviceId", validate(deleteServiceSchema), controller.deleteService);
  router.post("/services/:serviceId/offers", validate(createOfferSchema), controller.createOffer);
  router.patch("/services/:serviceId/offers/:offerId", validate(updateOfferSchema), controller.updateOffer);
  return router;
}
