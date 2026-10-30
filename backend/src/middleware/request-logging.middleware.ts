import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

import { appLogger } from "../shared/observability/agent-logger.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RequestLogContext {
  requestId: string;
  clientRunId?: string;
  startedAt: number;
}

export const requestLogging: RequestHandler = (request, response, next) => {
  const requestId = validId(request.get("X-Request-Id")) ?? randomUUID();
  const clientRunId = validId(request.get("X-Client-Run-Id"));
  const startedAt = Date.now();
  const context: RequestLogContext = { requestId, startedAt, ...(clientRunId ? { clientRunId } : {}) };

  response.locals.requestLog = context;
  response.setHeader("X-Request-Id", requestId);
  appLogger.info({
    event: "http.request.started",
    requestId,
    ...(clientRunId ? { clientRunId } : {}),
    method: request.method,
    route: routeName(request),
  });

  response.once("finish", () => {
    const status = response.statusCode;
    const fields = {
      event: "http.request.completed",
      requestId,
      ...(clientRunId ? { clientRunId } : {}),
      method: request.method,
      route: routeName(request),
      status,
      durationMs: Date.now() - startedAt,
    };
    if (status >= 500) appLogger.error(fields);
    else if (status >= 400) appLogger.warn(fields);
    else appLogger.info(fields);
  });

  response.once("close", () => {
    if (response.writableEnded) return;
    appLogger.warn({
      event: "http.response.client_disconnected",
      requestId,
      ...(clientRunId ? { clientRunId } : {}),
      method: request.method,
      route: routeName(request),
      status: response.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
};

export function getRequestLogContext(responseLocals: Record<string, unknown>): RequestLogContext | undefined {
  const value = responseLocals.requestLog;
  if (!value || typeof value !== "object") return undefined;
  const context = value as Partial<RequestLogContext>;
  return typeof context.requestId === "string" && typeof context.startedAt === "number"
    ? context as RequestLogContext
    : undefined;
}

function validId(value: string | undefined): string | undefined {
  return value && uuidPattern.test(value) ? value : undefined;
}

export function routeName(request: Parameters<RequestHandler>[0]): string {
  const routePath = request.route?.path;
  return routePath === undefined
    ? "unmatched"
    : `${request.baseUrl}${String(routePath)}`.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ":id");
}
