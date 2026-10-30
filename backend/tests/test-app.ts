import { createApp, type AppDependencies, type AppRuntimeConfig } from "../src/app.js";

const testAppConfig: AppRuntimeConfig = {
  CORS_ALLOWED_ORIGINS: ["http://localhost:8080", "http://127.0.0.1:8080"],
  API_JSON_BODY_LIMIT_BYTES: 1_048_576,
  AGENT_RATE_LIMIT_MAX_REQUESTS: 10,
  AGENT_RATE_LIMIT_WINDOW_MS: 60_000,
  GOOGLE_PLACES_RATE_LIMIT_MAX_REQUESTS: 30,
  GOOGLE_PLACES_RATE_LIMIT_WINDOW_MS: 60_000,
};

export function createTestApp(dependencies: AppDependencies) {
  return createApp(dependencies, testAppConfig);
}
