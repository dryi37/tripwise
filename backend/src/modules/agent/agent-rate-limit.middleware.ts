import type { RequestHandler } from "express";

interface Window { count: number; resetsAt: number }

export function createAgentRateLimit(maxRequests: number, windowMs: number): RequestHandler {
  const windows = new Map<string, Window>();
  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip ?? request.socket.remoteAddress ?? "unknown";
    const current = windows.get(key);
    const window = !current || current.resetsAt <= now
      ? { count: 0, resetsAt: now + windowMs }
      : current;
    window.count += 1;
    windows.set(key, window);
    if (window.count > maxRequests) {
      response.setHeader("Retry-After", Math.max(1, Math.ceil((window.resetsAt - now) / 1_000)));
      response.status(429).json({ error: { code: "AGENT_RATE_LIMITED", message: "Too many agent requests" } });
      return;
    }
    next();
  };
}
