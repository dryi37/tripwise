import { Router } from "express";
import { validate } from "../../middleware/validate.middleware.js";
import { ExternalSourceController } from "./external-source.controller.js";
import { listExternalSourcesSchema } from "./external-source.schemas.js";
import type { ExternalSourceService } from "./external-source.service.js";
export function createExternalSourceRouter(service: ExternalSourceService): Router { const router = Router({ mergeParams: true }); const controller = new ExternalSourceController(service); router.get("/", validate(listExternalSourcesSchema), controller.list); return router; }
