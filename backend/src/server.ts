import "dotenv/config";
import { randomUUID } from "node:crypto";

import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createPrismaClient } from "./database/prisma.js";
import { PrismaTripRepository } from "./modules/trips/infrastructure/prisma-trip.repository.js";
import { TripService } from "./modules/trips/trip.service.js";
import { PrismaPlanningRepository } from "./modules/planning/infrastructure/prisma-planning.repository.js";
import { PlanningService } from "./modules/planning/planning.service.js";
import { GemmaAgentModel } from "./modules/agent/infrastructure/gemma-agent.model.js";
import { TourAgentService } from "./modules/agent/tour-agent.service.js";
import { PrismaCatalogRepository } from "./modules/catalog/infrastructure/prisma-catalog.repository.js";
import { CatalogService } from "./modules/catalog/catalog.service.js";
import { CatalogOfferEmbeddingIndex } from "./modules/catalog/catalog-offer-embedding-index.js";
import { IdempotencyService } from "./shared/idempotency/idempotency.service.js";
import { PrismaIdempotencyStore } from "./shared/idempotency/prisma-idempotency.store.js";
import { PrismaVersionRepository } from "./modules/versions/infrastructure/prisma-version.repository.js";
import { VersionService } from "./modules/versions/version.service.js";
import { PrismaKnowledgeRepository } from "./modules/knowledge/infrastructure/prisma-knowledge.repository.js";
import { GeminiEmbeddingProvider } from "./modules/knowledge/infrastructure/gemini-embedding.provider.js";
import { QdrantVectorStore } from "./modules/knowledge/infrastructure/qdrant-vector.store.js";
import { KnowledgeService } from "./modules/knowledge/knowledge.service.js";
import { PrismaExternalSourceRepository } from "./modules/external-sources/infrastructure/prisma-external-source.repository.js";
import { ExternalSourceService } from "./modules/external-sources/external-source.service.js";
import { TavilyWebSearchProvider } from "./modules/web-search/infrastructure/tavily.web-search.provider.js";
import { WebSearchService } from "./modules/web-search/web-search.service.js";
import { FrankfurterExchangeRateProvider } from "./modules/currency/exchange-rate.provider.js";
import { PhotonProvider } from "./modules/places/infrastructure/photon.provider.js";
import { PlaceSearchStore } from "./modules/places/place-search.store.js";
import { PlacesService } from "./modules/places/places.service.js";
import { appLogger } from "./shared/observability/agent-logger.js";

const environment = loadEnvironment();
const qdrantOptions = {
  requestTimeoutMs: environment.QDRANT_REQUEST_TIMEOUT_MS,
  collectionCheckTimeoutMs: environment.QDRANT_COLLECTION_CHECK_TIMEOUT_MS,
  payloadBatchSize: environment.QDRANT_PAYLOAD_BATCH_SIZE,
};
const prisma = createPrismaClient(environment.DATABASE_URL);
const tripRepository = new PrismaTripRepository(prisma);
const tripService = new TripService(tripRepository);
const catalogService = new CatalogService(new PrismaCatalogRepository(prisma), { searchResultsPerTool: environment.AGENT_SEARCH_RESULTS_PER_TOOL }, new CatalogOfferEmbeddingIndex(new GeminiEmbeddingProvider(environment.GEMINI_API_KEY, environment.EMBEDDING_MODEL), new QdrantVectorStore(environment.QDRANT_URL, environment.QDRANT_CATALOG_COLLECTION, qdrantOptions)));
const externalSourceService = new ExternalSourceService(new PrismaExternalSourceRepository(prisma));
const placesService = new PlacesService(
  new PhotonProvider(environment.PHOTON_API_URL, environment.PHOTON_TIMEOUT_MS, environment.PHOTON_CACHE_TTL_MS),
  new PlaceSearchStore(environment.PLACE_SEARCH_SELECTION_TTL_MS, environment.PLACE_SEARCH_MAX_SELECTIONS),
  tripService,
  environment.AGENT_SEARCH_RESULTS_PER_TOOL,
);
const webSearchService = new WebSearchService(new TavilyWebSearchProvider(environment.TAVILY_API_KEY, environment.WEB_SEARCH_TIMEOUT_MS), { now: () => new Date(), maxResults: environment.AGENT_SEARCH_RESULTS_PER_TOOL, staleAfterDays: environment.WEB_SOURCE_STALE_DAYS });
const planningService = new PlanningService(tripRepository, new PrismaPlanningRepository(prisma), undefined, catalogService, externalSourceService, environment.APP_TIMEZONE, new FrankfurterExchangeRateProvider(environment.FX_RATE_API_URL, environment.FX_RATE_TIMEOUT_MS, environment.FX_RATE_CACHE_TTL_MS), placesService);
const idempotencyService = new IdempotencyService(new PrismaIdempotencyStore(prisma));
const versionService = new VersionService(new PrismaVersionRepository(prisma), tripService, planningService);
const knowledgeService = new KnowledgeService(
  new PrismaKnowledgeRepository(prisma),
  new GeminiEmbeddingProvider(environment.GEMINI_API_KEY, environment.EMBEDDING_MODEL),
  new QdrantVectorStore(environment.QDRANT_URL, environment.QDRANT_COLLECTION, qdrantOptions),
  { createId: randomUUID, now: () => new Date(), chunkSize: environment.KNOWLEDGE_CHUNK_SIZE, chunkOverlap: environment.KNOWLEDGE_CHUNK_OVERLAP, maxSearchLimit: environment.AGENT_SEARCH_RESULTS_PER_TOOL },
);
const tourAgentService = new TourAgentService(
  tripService,
  planningService,
  new GemmaAgentModel(environment.GEMINI_API_KEY, environment.GEMMA_MODEL, {
    requestTimeoutMs: environment.GEMMA_REQUEST_TIMEOUT_MS,
    maxRetries: environment.GEMMA_MAX_RETRIES,
    maxToolResultContextChars: environment.GEMMA_MAX_TOOL_RESULT_CONTEXT_CHARS,
    retryBaseDelayMs: environment.GEMMA_RETRY_BASE_DELAY_MS,
    retryMaxDelayMs: environment.GEMMA_RETRY_MAX_DELAY_MS,
    maxOutputTokens: environment.GEMMA_MAX_OUTPUT_TOKENS,
  }),
  environment.AGENT_MODEL_CALLS_PER_DAY,
  environment.AGENT_TOOL_CALLS_PER_DAY,
  catalogService,
  knowledgeService,
  webSearchService,
  externalSourceService,
  environment.AGENT_REQUEST_TIMEOUT_MS,
  placesService,
);
const app = createApp({ tripService, planningService, tourAgentService, catalogService, idempotencyService, versionService, knowledgeService, externalSourceService, placesService }, environment);

appLogger.info({ event: "catalog.embedding_index.startup_started" });
void catalogService.reindexAllOffers()
  .then(() => appLogger.info({ event: "catalog.embedding_index.startup_complete" }))
  .catch((error: unknown) => appLogger.error({ event: "catalog.embedding_index.startup_failed", errorName: error instanceof Error ? error.name : "UNKNOWN_ERROR" }));

const server = app.listen(environment.PORT, () => {
  appLogger.info({ event: "server.started", port: environment.PORT, nodeEnv: environment.NODE_ENV });
});

async function shutdown(signal: "SIGINT" | "SIGTERM"): Promise<void> {
  appLogger.info({ event: "server.shutdown.started", signal });
  server.close(async () => {
    await prisma.$disconnect();
    appLogger.info({ event: "server.shutdown.completed" });
    process.exit(0);
  });
}

process.on("SIGINT", () => { void shutdown("SIGINT"); });
process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
