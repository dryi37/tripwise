import type { RequestHandler } from "express";

import { ApiError } from "../shared/http/api-error.js";

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, "ROUTE_NOT_FOUND", "Route not found"));
};
