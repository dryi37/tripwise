import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(1).max(65_535),
  DATABASE_URL: z.url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  }, "DATABASE_URL must be a PostgreSQL connection URL"),
  APP_TIMEZONE: z.string().trim().min(1).max(80).refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
    catch { return false; }
  }, "APP_TIMEZONE must be a valid IANA timezone"),
  FX_RATE_API_URL: z.url(),
  FX_RATE_TIMEOUT_MS: z.coerce.number().int().positive(),
  FX_RATE_CACHE_TTL_MS: z.coerce.number().int().positive(),
  GEMINI_API_KEY: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).optional(),
  ),
  GEMMA_MODEL: z.string().trim().min(1),
  AGENT_MODEL_PROVIDER: z.enum(["gemini", "gx10"]).default("gemini"),
  GX10_BASE_URL: z.url().default("http://172.16.110.26:7997/v1"),
  GX10_API_KEY: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).optional(),
  ),
  GX10_MODEL: z.string().trim().min(1).default("qwen3.6-35b-a3b"),
  GX10_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(120_000).default(120_000),
  GX10_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  GX10_MAX_TOOL_RESULT_CONTEXT_CHARS: z.coerce.number().int().positive().default(14_000),
  GX10_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(500),
  GX10_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(5_000),
  GX10_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(4_096),
  AGENT_MODEL_CALLS_PER_DAY: z.coerce.number().int().positive(),
  AGENT_TOOL_CALLS_PER_DAY: z.coerce.number().int().positive(),
  AGENT_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1),
  AGENT_SEARCH_RESULTS_PER_TOOL: z.coerce.number().int().positive(),
  APP_LOG_FILE: z.string().trim().min(1),
  GEMMA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive(),
  GEMMA_MAX_RETRIES: z.coerce.number().int().min(0),
  GEMMA_MAX_TOOL_RESULT_CONTEXT_CHARS: z.coerce.number().int().positive(),
  GEMMA_SUMMARY_TRIGGER_TOKENS: z.coerce.number().int().positive().default(12_000),
  GEMMA_MAX_INPUT_TOKENS: z.coerce.number().int().positive().default(16_000),
  GEMMA_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive(),
  GEMMA_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive(),
  GEMMA_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive(),
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
  PHOTON_API_URL: z.url().default("https://photon.komoot.io"),
  PHOTON_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
  PHOTON_CACHE_TTL_MS: z.coerce.number().int().positive().default(21_600_000),
  PLACE_SEARCH_SELECTION_TTL_MS: z.coerce.number().int().positive().default(900_000),
  PLACE_SEARCH_MAX_SELECTIONS: z.coerce.number().int().positive().default(1_000),
  PLACE_SEARCH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(30),
  PLACE_SEARCH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  WEB_SEARCH_TIMEOUT_MS: z.coerce.number().int().positive(),
  WEB_SOURCE_STALE_DAYS: z.coerce.number().int().positive(),
  AGENT_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive(),
  AGENT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive(),
  API_JSON_BODY_LIMIT_BYTES: z.coerce.number().int().positive(),
  CORS_ALLOWED_ORIGINS: z.string().transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)).pipe(z.array(z.url()).min(1)),
}).superRefine((environment, context) => {
  if (environment.AGENT_MODEL_PROVIDER === "gx10" && !environment.GX10_API_KEY) {
    context.addIssue({ code: "custom", path: ["GX10_API_KEY"], message: "GX10_API_KEY is required when AGENT_MODEL_PROVIDER=gx10" });
  }
});

export type Environment = z.infer<typeof envSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  return envSchema.parse(source);
}
