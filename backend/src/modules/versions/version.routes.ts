import { Router } from "express";
import { validate } from "../../middleware/validate.middleware.js";
import { VersionController } from "./version.controller.js";
import { createVersionSchema, listVersionsSchema, restoreVersionSchema } from "./version.schemas.js";
import type { VersionService } from "./version.service.js";
export function createVersionRouter(service: VersionService) { const router = Router({ mergeParams: true }); const controller = new VersionController(service); router.get("/", validate(listVersionsSchema), controller.list); router.post("/", validate(createVersionSchema), controller.create); router.post("/:versionId/restore", validate(restoreVersionSchema), controller.restore); return router; }
