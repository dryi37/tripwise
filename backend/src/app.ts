import express, { type Express } from "express";
import type { Environment } from "./config/env.js";

import { createTourAgentRouter } from "./modules/agent/tour-agent.routes.js";
import type { TourAgentService } from "./modules/agent/tour-agent.service.js";
import { errorHandler } from "./middleware/error-handler.middleware.js";
import { notFound } from "./middleware/not-found.middleware.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { createPlanningRouter } from "./modules/planning/planning.routes.js";
import type { PlanningService } from "./modules/planning/planning.service.js";
import { createTripRouter } from "./modules/trips/trip.routes.js";
import { TripService } from "./modules/trips/trip.service.js";
import { createCatalogRouter } from "./modules/catalog/catalog.routes.js";
import type { CatalogService } from "./modules/catalog/catalog.service.js";
import type { IdempotencyService } from "./shared/idempotency/idempotency.service.js";
import { createVersionRouter } from "./modules/versions/version.routes.js";
import type { VersionService } from "./modules/versions/version.service.js";
import { createKnowledgeRouter } from "./modules/knowledge/knowledge.routes.js";
import type { KnowledgeService } from "./modules/knowledge/knowledge.service.js";
import type { ExternalSourceService } from "./modules/external-sources/external-source.service.js";
import { createExternalSourceRouter } from "./modules/external-sources/external-source.routes.js";

export interface AppDependencies {
  tripService: TripService;
  planningService: PlanningService;
  tourAgentService?: TourAgentService;
  catalogService?: CatalogService;
  idempotencyService?: IdempotencyService;
  versionService?: VersionService;
  knowledgeService?: KnowledgeService;
  externalSourceService?: ExternalSourceService;
}

export type AppRuntimeConfig = Pick<Environment, "CORS_ALLOWED_ORIGINS" | "API_JSON_BODY_LIMIT_BYTES" | "AGENT_RATE_LIMIT_MAX_REQUESTS" | "AGENT_RATE_LIMIT_WINDOW_MS">;

export function createApp(dependencies: AppDependencies, config: AppRuntimeConfig): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use((request, response, next) => {
    const origin = request.header("Origin");
    if (origin && config.CORS_ALLOWED_ORIGINS.includes(origin)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type,Idempotency-Key,X-Client-Run-Id");
    }
    if (request.method === "OPTIONS") { response.sendStatus(204); return; }
    next();
  });
  app.use(express.json({ limit: config.API_JSON_BODY_LIMIT_BYTES }));
  app.use("/api/v1/health", healthRouter);
  app.use("/api/v1/trips", createTripRouter(dependencies.tripService));
  app.use("/api/v1/trips/:tripId", createPlanningRouter(dependencies.planningService, dependencies.idempotencyService));
  if (dependencies.versionService) app.use("/api/v1/trips/:tripId/versions", createVersionRouter(dependencies.versionService));
  if (dependencies.catalogService) app.use("/api/v1/catalog", createCatalogRouter(dependencies.catalogService));
  if (dependencies.knowledgeService) app.use("/api/v1/knowledge", createKnowledgeRouter(dependencies.knowledgeService));
  if (dependencies.externalSourceService) app.use("/api/v1/trips/:tripId/external-sources", createExternalSourceRouter(dependencies.externalSourceService));
  if (dependencies.tourAgentService) {
    app.use("/api/v1/trips/:tripId", createTourAgentRouter(dependencies.tourAgentService, { maxRequests: config.AGENT_RATE_LIMIT_MAX_REQUESTS, windowMs: config.AGENT_RATE_LIMIT_WINDOW_MS }));
  }
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
