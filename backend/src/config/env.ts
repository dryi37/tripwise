import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(1).max(65_535),
  DATABASE_URL: z.url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  }, "DATABASE_URL must be a PostgreSQL connection URL"),
  GEMINI_API_KEY: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).optional(),
  ),
  GEMMA_MODEL: z.string().trim().min(1),
  AGENT_MODEL_CALLS_PER_DAY: z.coerce.number().int().positive(),
  AGENT_TOOL_CALLS_PER_DAY: z.coerce.number().int().positive(),
  AGENT_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1),
  AGENT_SEARCH_RESULTS_PER_TOOL: z.coerce.number().int().positive(),
  AGENT_LOG_FILE: z.string().trim().min(1),
  GEMMA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive(),
  GEMMA_MAX_RETRIES: z.coerce.number().int().min(0),
  GEMMA_MAX_TOOL_RESULT_CONTEXT_CHARS: z.coerce.number().int().positive(),
  GEMMA_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive(),
  GEMMA_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive(),
  GEMMA_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive(),
  GEMMA_RESEARCH_CALLS_MINIMUM: z.coerce.number().int().positive(),
  GEMMA_RESEARCH_CALLS_PER_TRIP_DAY: z.coerce.number().int().positive(),
  QDRANT_URL: z.url(),
  QDRANT_COLLECTION: z.string().trim().min(1),
  QDRANT_CATALOG_COLLECTION: z.string().trim().min(1),
  QDRANT_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive(),
  QDRANT_COLLECTION_CHECK_TIMEOUT_MS: z.coerce.number().int().positive(),
  QDRANT_PAYLOAD_BATCH_SIZE: z.coerce.number().int().positive(),
  EMBEDDING_MODEL: z.string().trim().min(1),
  KNOWLEDGE_CHUNK_SIZE: z.coerce.number().int().min(1),
  KNOWLEDGE_CHUNK_OVERLAP: z.coerce.number().int().min(0),
  TAVILY_API_KEY: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().trim().min(1).optional()),
  WEB_SEARCH_TIMEOUT_MS: z.coerce.number().int().positive(),
  WEB_SOURCE_STALE_DAYS: z.coerce.number().int().positive(),
  AGENT_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive(),
  AGENT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive(),
  API_JSON_BODY_LIMIT_BYTES: z.coerce.number().int().positive(),
  CORS_ALLOWED_ORIGINS: z.string().transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)).pipe(z.array(z.url()).min(1)),
});

export type Environment = z.infer<typeof envSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  return envSchema.parse(source);
}
