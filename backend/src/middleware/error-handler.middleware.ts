import type { ErrorRequestHandler } from "express";

import { ApiError } from "../shared/http/api-error.js";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const apiError = error instanceof ApiError
    ? error
    : isJsonParseError(error)
      ? new ApiError(400, "INVALID_JSON", "Request body contains invalid JSON")
      : new ApiError(500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred");

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
