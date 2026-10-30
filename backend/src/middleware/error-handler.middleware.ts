import type { ErrorRequestHandler } from "express";

import { ApiError } from "../shared/http/api-error.js";
import { appLogger } from "../shared/observability/agent-logger.js";
import { getRequestLogContext, routeName } from "./request-logging.middleware.js";

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const apiError = error instanceof ApiError
    ? error
    : isJsonParseError(error)
      ? new ApiError(400, "INVALID_JSON", "Request body contains invalid JSON")
      : new ApiError(500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred");

  const context = getRequestLogContext(response.locals as Record<string, unknown>);
  const fields = {
    event: "http.request.failed",
    ...(context ? { requestId: context.requestId, ...(context.clientRunId ? { clientRunId: context.clientRunId } : {}), durationMs: Date.now() - context.startedAt } : {}),
    method: request.method,
    route: routeName(request),
    status: apiError.status,
    errorCode: apiError.code,
    errorName: error instanceof Error ? error.name : "UNKNOWN_ERROR",
  };
  if (apiError.status >= 500) appLogger.error(fields);
  else appLogger.warn(fields);

  response.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details === undefined ? {} : { details: apiError.details }),
    },
  });
};

function isJsonParseError(error: unknown): error is { status: 400; type: "entity.parse.failed" } {
  return typeof error === "object"
    && error !== null
    && "status" in error
    && error.status === 400
    && "type" in error
    && error.type === "entity.parse.failed";
}
