import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";

import { ApiError } from "../../shared/http/api-error.js";
import { agentLogger } from "../../shared/observability/agent-logger.js";
import { getRequestLogContext } from "../../middleware/request-logging.middleware.js";

import type {
  CreateTripRequest,
  GetTripRequest,
  ListTripsRequest,
  UpdateTripRequest,
} from "./trip.schemas.js";
import type { TripService } from "./trip.service.js";
import type { ListTripsInput, UpdateTripInput } from "./trip.types.js";

function validated<T>(locals: Record<string, unknown>): T {
  return locals.validated as T;
}

export class TripController {
  constructor(private readonly service: TripService) {}

  create: RequestHandler = async (request, response) => {
    const runId = correlationId(request.get("X-Client-Run-Id") ?? getRequestLogContext(response.locals as Record<string, unknown>)?.requestId);
    const startedAt = Date.now();
    agentLogger.info({ event: "http.trip.create.started", runId });
    try {
      const input = validated<CreateTripRequest>(response.locals).body;
      const trip = await this.service.create(Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as CreateTripRequest["body"] & import("./trip.types.js").CreateTripInput);
      agentLogger.info({ event: "http.trip.create.completed", runId, tripId: trip.id, durationMs: Date.now() - startedAt, status: 201 });
      response.status(201).json({ data: trip });
    } catch (error) {
      agentLogger.error({ event: "http.trip.create.failed", runId, durationMs: Date.now() - startedAt, errorCode: error instanceof ApiError ? error.code : error instanceof Error ? error.name : "UNKNOWN_ERROR", status: error instanceof ApiError ? error.status : undefined });
      throw error;
    }
  };

  get: RequestHandler = async (_request, response) => {
    const input = validated<GetTripRequest>(response.locals);
    const trip = await this.service.get(input.params.tripId);
    response.json({ data: trip });
  };

  list: RequestHandler = async (_request, response) => {
    const input = validated<ListTripsRequest>(response.locals).query;
    const query: ListTripsInput = {
      pageSize: input.pageSize,
      ...(input.q === undefined ? {} : { q: input.q }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    };
    const page = await this.service.list(query);
    response.json({ data: page.data, page: { nextCursor: page.nextCursor } });
  };

  update: RequestHandler = async (_request, response) => {
    const input = validated<UpdateTripRequest>(response.locals);
    const changes = Object.fromEntries(
      Object.entries(input.body).filter(([, value]) => value !== undefined),
    ) as UpdateTripInput;
    const trip = await this.service.update(input.params.tripId, changes);
    response.json({ data: trip });
  };
}

function correlationId(value: string | undefined): string {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : randomUUID();
}
