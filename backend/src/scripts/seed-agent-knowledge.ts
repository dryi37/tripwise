import "dotenv/config";
import { randomUUID } from "node:crypto";
import { loadEnvironment } from "../config/env.js";
import { createPrismaClient } from "../database/prisma.js";
import { GeminiEmbeddingProvider } from "../modules/knowledge/infrastructure/gemini-embedding.provider.js";
import { PrismaKnowledgeRepository } from "../modules/knowledge/infrastructure/prisma-knowledge.repository.js";
import { QdrantVectorStore } from "../modules/knowledge/infrastructure/qdrant-vector.store.js";
import { KnowledgeService } from "../modules/knowledge/knowledge.service.js";
import { agentKnowledgeDocuments } from "./agent-knowledge-seed-data.js";

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const prisma = createPrismaClient(environment.DATABASE_URL);
  try {
    const knowledge = new KnowledgeService(
      new PrismaKnowledgeRepository(prisma),
      new GeminiEmbeddingProvider(environment.GEMINI_API_KEY, environment.EMBEDDING_MODEL),
      new QdrantVectorStore(environment.QDRANT_URL, environment.QDRANT_COLLECTION, {
        requestTimeoutMs: environment.QDRANT_REQUEST_TIMEOUT_MS,
        collectionCheckTimeoutMs: environment.QDRANT_COLLECTION_CHECK_TIMEOUT_MS,
        payloadBatchSize: environment.QDRANT_PAYLOAD_BATCH_SIZE,
      }),
      { createId: randomUUID, now: () => new Date(), chunkSize: environment.KNOWLEDGE_CHUNK_SIZE, chunkOverlap: environment.KNOWLEDGE_CHUNK_OVERLAP, maxSearchLimit: environment.AGENT_SEARCH_RESULTS_PER_TOOL },
    );
    const documents = [];
    for (const input of agentKnowledgeDocuments) {
      const document = await knowledge.create(input);
      documents.push({ id: document.id, title: document.title, status: document.status });
    }
    console.log(JSON.stringify({ status: "seeded", count: documents.length, documents }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Knowledge seed failed");
  process.exitCode = 1;
});
