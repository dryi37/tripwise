import { readFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentLogger } from "../src/shared/observability/agent-logger.js";

describe("AgentLogger", () => {
  const logPath = resolve(".tmp", `agent-log-${randomUUID()}.jsonl`);
  afterEach(() => {
    rmSync(logPath, { force: true });
    vi.restoreAllMocks();
  });

  it("persists structured agent events as JSONL and mirrors them to console", () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const logger = new AgentLogger(logPath);

    logger.info({ event: "tour_agent.run.started", runId: "run-123", tripId: "trip-456" });

    const record = JSON.parse(readFileSync(logPath, "utf8").trim()) as Record<string, unknown>;
    expect(record).toMatchObject({ event: "tour_agent.run.started", runId: "run-123", tripId: "trip-456" });
    expect(record.timestamp).toEqual(expect.any(String));
    expect(consoleInfo).toHaveBeenCalledWith(JSON.stringify(record));
  });
});
