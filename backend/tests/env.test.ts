import { describe, expect, it } from "vitest";

import { loadEnvironment } from "../src/config/env.js";

const databaseUrl = "postgresql://user:pass@localhost:5432/db";
const baseEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "development", PORT: "3101", DATABASE_URL: databaseUrl,
  GEMMA_MODEL: "gemma-4-26b-a4b-it", AGENT_MODEL_CALLS_PER_DAY: "12", AGENT_TOOL_CALLS_PER_DAY: "20",
  AGENT_REQUEST_TIMEOUT_MS: "300000", AGENT_SEARCH_RESULTS_PER_TOOL: "5", AGENT_LOG_FILE: "../artifacts/logs/backend/agent-runs.jsonl",
  GEMMA_REQUEST_TIMEOUT_MS: "60000", GEMMA_MAX_RETRIES: "7", GEMMA_MAX_TOOL_RESULT_CONTEXT_CHARS: "13000",
  GEMMA_RETRY_BASE_DELAY_MS: "250", GEMMA_RETRY_MAX_DELAY_MS: "5000", GEMMA_MAX_OUTPUT_TOKENS: "2048",
  GEMMA_RESEARCH_CALLS_MINIMUM: "8", GEMMA_RESEARCH_CALLS_PER_TRIP_DAY: "4",
  QDRANT_URL: "http://127.0.0.1:6333", QDRANT_COLLECTION: "tripwise_knowledge", QDRANT_CATALOG_COLLECTION: "tripwise_catalog_offers",
  QDRANT_REQUEST_TIMEOUT_MS: "10000", QDRANT_COLLECTION_CHECK_TIMEOUT_MS: "5000", QDRANT_PAYLOAD_BATCH_SIZE: "256",
  EMBEDDING_MODEL: "gemini-embedding-001", KNOWLEDGE_CHUNK_SIZE: "1200", KNOWLEDGE_CHUNK_OVERLAP: "150",
  WEB_SEARCH_TIMEOUT_MS: "10000", WEB_SOURCE_STALE_DAYS: "180",
  AGENT_RATE_LIMIT_MAX_REQUESTS: "10", AGENT_RATE_LIMIT_WINDOW_MS: "60000", API_JSON_BODY_LIMIT_BYTES: "1048576",
  CORS_ALLOWED_ORIGINS: "http://localhost:8080,http://127.0.0.1:8080",
};
const validEnvironment = (overrides: NodeJS.ProcessEnv = {}) => loadEnvironment({ ...baseEnvironment, ...overrides });

describe("environment validation", () => {
  it("rejects a malformed PostgreSQL connection string", () => {
    expect(() => loadEnvironment({ DATABASE_URL: "garbage", AGENT_SEARCH_RESULTS_PER_TOOL: "5" })).toThrow();
  });

  it("requires the agent search result limit to come from environment configuration", () => {
    const missingLimit = { ...baseEnvironment };
    delete missingLimit.AGENT_SEARCH_RESULTS_PER_TOOL;
    expect(() => loadEnvironment(missingLimit)).toThrow();
    expect(validEnvironment()).toMatchObject({ AGENT_SEARCH_RESULTS_PER_TOOL: 5 });
    expect(validEnvironment({ AGENT_SEARCH_RESULTS_PER_TOOL: "8" })).toMatchObject({ AGENT_SEARCH_RESULTS_PER_TOOL: 8 });
    expect(() => validEnvironment({ AGENT_SEARCH_RESULTS_PER_TOOL: "0" })).toThrow();
  });

  it("accepts postgres and postgresql connection URLs", () => {
    expect(validEnvironment({ DATABASE_URL: "postgres://user:pass@localhost:5432/db" })).toMatchObject({ PORT: 3101 });
    expect(validEnvironment()).toMatchObject({ NODE_ENV: "development" });
  });

  it("loads bounded local Qdrant and embedding configuration", () => {
    expect(validEnvironment()).toMatchObject({
      QDRANT_URL: "http://127.0.0.1:6333",
      QDRANT_COLLECTION: "tripwise_knowledge",
      QDRANT_CATALOG_COLLECTION: "tripwise_catalog_offers",
      EMBEDDING_MODEL: "gemini-embedding-001",
      KNOWLEDGE_CHUNK_SIZE: 1200,
      KNOWLEDGE_CHUNK_OVERLAP: 150,
      QDRANT_REQUEST_TIMEOUT_MS: 10_000,
      QDRANT_COLLECTION_CHECK_TIMEOUT_MS: 5_000,
      QDRANT_PAYLOAD_BATCH_SIZE: 256,
    });
  });

  it("loads agent, HTTP, and CORS operational settings from the environment", () => {
    expect(validEnvironment()).toMatchObject({
      GEMMA_REQUEST_TIMEOUT_MS: 60_000,
      GEMMA_MAX_RETRIES: 7,
      GEMMA_MAX_TOOL_RESULT_CONTEXT_CHARS: 13_000,
      GEMMA_RETRY_BASE_DELAY_MS: 250,
      GEMMA_RETRY_MAX_DELAY_MS: 5_000,
      GEMMA_MAX_OUTPUT_TOKENS: 2_048,
      GEMMA_RESEARCH_CALLS_MINIMUM: 8,
      GEMMA_RESEARCH_CALLS_PER_TRIP_DAY: 4,
      AGENT_RATE_LIMIT_MAX_REQUESTS: 10,
      AGENT_RATE_LIMIT_WINDOW_MS: 60_000,
      AGENT_LOG_FILE: "../artifacts/logs/backend/agent-runs.jsonl",
      API_JSON_BODY_LIMIT_BYTES: 1_048_576,
      CORS_ALLOWED_ORIGINS: ["http://localhost:8080", "http://127.0.0.1:8080"],
    });
  });

  it("loads optional Gemma agent configuration", () => {
    expect(validEnvironment({
      GEMINI_API_KEY: "secret",
      GEMMA_MODEL: "gemma-4-31b-it",
      AGENT_MODEL_CALLS_PER_DAY: "6",
      AGENT_TOOL_CALLS_PER_DAY: "40",
      AGENT_REQUEST_TIMEOUT_MS: "360000",
    })).toMatchObject({
      GEMINI_API_KEY: "secret",
      GEMMA_MODEL: "gemma-4-31b-it",
      AGENT_MODEL_CALLS_PER_DAY: 6,
      AGENT_TOOL_CALLS_PER_DAY: 40,
      AGENT_REQUEST_TIMEOUT_MS: 360_000,
    });
    expect(validEnvironment().AGENT_REQUEST_TIMEOUT_MS).toBe(300_000);
    expect(validEnvironment()).toMatchObject({ AGENT_MODEL_CALLS_PER_DAY: 12, AGENT_TOOL_CALLS_PER_DAY: 20 });
    expect(() => validEnvironment({ AGENT_REQUEST_TIMEOUT_MS: "0" })).toThrow();
  });

  it("treats the blank API key from .env.example as unconfigured", () => {
    expect(validEnvironment({ GEMINI_API_KEY: "  " }).GEMINI_API_KEY).toBeUndefined();
  });

  it("loads optional web-search configuration", () => {
    expect(validEnvironment({ TAVILY_API_KEY: "key", WEB_SEARCH_TIMEOUT_MS: "8000", WEB_SOURCE_STALE_DAYS: "90" }))
      .toMatchObject({ TAVILY_API_KEY: "key", WEB_SEARCH_TIMEOUT_MS: 8000, WEB_SOURCE_STALE_DAYS: 90 });
  });
});
