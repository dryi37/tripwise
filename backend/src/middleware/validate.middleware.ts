import type { RequestHandler } from "express";
import type { ZodType } from "zod";

import { ApiError } from "../shared/http/api-error.js";

export interface ValidatedRequest<TParams = unknown, TQuery = unknown, TBody = unknown> {
  params: TParams;
  query: TQuery;
  body: TBody;
}

export function validate<T>(schema: ZodType<T>): RequestHandler {
  return (request, response, next) => {
    const result = schema.safeParse({
      params: request.params,
      query: request.query,
      body: request.body,
    });

    if (!result.success) {
      next(new ApiError(422, "VALIDATION_ERROR", "Request validation failed", result.error.issues));
      return;
    }

    response.locals.validated = result.data;
    next();
  };
}
