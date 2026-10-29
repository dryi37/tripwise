import { Router } from "express";

import { validate } from "../../middleware/validate.middleware.js";
import { createAgentRateLimit } from "./agent-rate-limit.middleware.js";
import { TourAgentController } from "./tour-agent.controller.js";
import { runTourAgentSchema } from "./tour-agent.schemas.js";
import type { TourAgentService } from "./tour-agent.service.js";

export function createTourAgentRouter(service: TourAgentService, rateLimit: { maxRequests: number; windowMs: number }): Router {
  const router = Router({ mergeParams: true });
  const controller = new TourAgentController(service);
  router.post("/agent/runs", createAgentRateLimit(rateLimit.maxRequests, rateLimit.windowMs), validate(runTourAgentSchema), controller.run);
  return router;
}
