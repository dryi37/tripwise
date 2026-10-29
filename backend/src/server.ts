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
const webSearchService = new WebSearchService(new TavilyWebSearchProvider(environment.TAVILY_API_KEY, environment.WEB_SEARCH_TIMEOUT_MS), { now: () => new Date(), maxResults: environment.AGENT_SEARCH_RESULTS_PER_TOOL, staleAfterDays: environment.WEB_SOURCE_STALE_DAYS });
const planningService = new PlanningService(tripRepository, new PrismaPlanningRepository(prisma), undefined, catalogService, externalSourceService);
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
    researchCallsMinimum: environment.GEMMA_RESEARCH_CALLS_MINIMUM,
    researchCallsPerTripDay: environment.GEMMA_RESEARCH_CALLS_PER_TRIP_DAY,
  }),
  environment.AGENT_MODEL_CALLS_PER_DAY,
  environment.AGENT_TOOL_CALLS_PER_DAY,
  catalogService,
  knowledgeService,
  webSearchService,
  externalSourceService,
  environment.AGENT_REQUEST_TIMEOUT_MS,
);
const app = createApp({ tripService, planningService, tourAgentService, catalogService, idempotencyService, versionService, knowledgeService, externalSourceService }, environment);

void catalogService.reindexAllOffers().then(() => console.info(JSON.stringify({ event: "catalog.embedding_index.startup_complete" }))).catch((error: unknown) => console.warn(JSON.stringify({ event: "catalog.embedding_index.startup_failed", error: error instanceof Error ? error.message : "UNKNOWN_ERROR" })));

const server = app.listen(environment.PORT, () => {
  console.log(`Tripwise API listening on port ${environment.PORT}`);
});

async function shutdown(): Promise<void> {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
