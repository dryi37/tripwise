import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";

import { ApiError } from "../../shared/http/api-error.js";
import { agentLogger } from "../../shared/observability/agent-logger.js";

import type { RunTourAgentRequest } from "./tour-agent.schemas.js";
import type { TourAgentService } from "./tour-agent.service.js";

export class TourAgentController {
  constructor(private readonly service: TourAgentService) {}

  run: RequestHandler = async (request, response) => {
    const input = response.locals.validated as RunTourAgentRequest;
    const runId = correlationId(request.get("X-Client-Run-Id"));
    const startedAt = Date.now();
    agentLogger.info({ event: "http.agent.request.started", runId, tripId: input.params.tripId });
    try {
      const result = await this.service.run(input.params.tripId, input.body, runId);
      agentLogger.info({ event: "http.agent.request.completed", runId, tripId: input.params.tripId, durationMs: Date.now() - startedAt, status: 200 });
      response.json({ data: result });
    } catch (error) {
      agentLogger.error({ event: "http.agent.request.failed", runId, tripId: input.params.tripId, durationMs: Date.now() - startedAt, errorCode: error instanceof ApiError ? error.code : error instanceof Error ? error.name : "UNKNOWN_ERROR", status: error instanceof ApiError ? error.status : undefined });
      throw error;
    }
  };
}

function correlationId(value: string | undefined): string {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : randomUUID();
}
