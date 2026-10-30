import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type AgentLogFields = Record<string, unknown> & { event: string };
export type AgentLogLevel = "info" | "warn" | "error";

export const APP_LOG_FILE = process.env.APP_LOG_FILE
  ? resolve(process.env.APP_LOG_FILE)
  : undefined;

export class AgentLogger {
  constructor(private readonly filePath = APP_LOG_FILE) {}

  info(fields: AgentLogFields): void { this.write("info", fields); }
  warn(fields: AgentLogFields): void { this.write("warn", fields); }
  error(fields: AgentLogFields): void { this.write("error", fields); }

  private write(level: AgentLogLevel, fields: AgentLogFields): void {
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...fields });
    console[level](line);
    try {
      if (this.filePath) {
        mkdirSync(dirname(this.filePath), { recursive: true });
        appendFileSync(this.filePath, `${line}\n`, "utf8");
      }
    } catch (error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "agent.log.write_failed",
        errorName: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      }));
    }
  }
}

export const appLogger = new AgentLogger();
// Preserve existing agent instrumentation imports while the same sink records all application events.
export const agentLogger = appLogger;
