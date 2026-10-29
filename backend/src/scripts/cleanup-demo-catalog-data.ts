import "dotenv/config";
import { loadEnvironment } from "../config/env.js";
import { createPrismaClient } from "../database/prisma.js";
import { QdrantVectorStore } from "../modules/knowledge/infrastructure/qdrant-vector.store.js";

const DEMO_TAG = "[DEMO - CHỈ DÙNG KIỂM THỬ]";

async function collectionExists(baseUrl: string, collection: string, timeoutMs: number): Promise<boolean> {
  const response = await fetch(`${baseUrl}/collections/${encodeURIComponent(collection)}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Qdrant collection check failed with HTTP ${response.status}`);
  return true;
}

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const prisma = createPrismaClient(environment.DATABASE_URL);
    const qdrantOptions = {
      requestTimeoutMs: environment.QDRANT_REQUEST_TIMEOUT_MS,
      collectionCheckTimeoutMs: environment.QDRANT_COLLECTION_CHECK_TIMEOUT_MS,
      payloadBatchSize: environment.QDRANT_PAYLOAD_BATCH_SIZE,
    };
  try {
    const demoServices = await prisma.service.findMany({
      where: { name: { startsWith: DEMO_TAG } },
      select: { id: true, name: true, offer: { select: { id: true } } },
    });
    const offerIds = demoServices.flatMap((service) => service.offer ? [service.offer.id] : []);
    const demoKnowledge = await prisma.knowledgeDocument.findMany({
      where: { OR: [{ title: { startsWith: DEMO_TAG } }, { sourceLabel: { startsWith: DEMO_TAG } }] },
      select: { id: true, title: true },
    });
    const [quoteReferences, itineraryReferences] = offerIds.length
      ? await Promise.all([
          prisma.quoteItem.count({ where: { supplierOfferId: { in: offerIds } } }),
          prisma.itineraryItem.count({ where: { supplierOfferId: { in: offerIds } } }),
        ])
      : [0, 0];

    if (offerIds.length && await collectionExists(environment.QDRANT_URL, environment.QDRANT_CATALOG_COLLECTION, environment.QDRANT_COLLECTION_CHECK_TIMEOUT_MS)) {
      await new QdrantVectorStore(environment.QDRANT_URL, environment.QDRANT_CATALOG_COLLECTION, qdrantOptions).deleteByIds(offerIds);
    }
    if (demoKnowledge.length && await collectionExists(environment.QDRANT_URL, environment.QDRANT_COLLECTION, environment.QDRANT_COLLECTION_CHECK_TIMEOUT_MS)) {
      const knowledgeVectors = new QdrantVectorStore(environment.QDRANT_URL, environment.QDRANT_COLLECTION, qdrantOptions);
      for (const document of demoKnowledge) await knowledgeVectors.deleteByDocument(document.id);
    }

    if (demoServices.length) {
      await prisma.service.deleteMany({ where: { id: { in: demoServices.map((service) => service.id) } } });
    }
    if (demoKnowledge.length) {
      await prisma.knowledgeDocument.deleteMany({ where: { id: { in: demoKnowledge.map((document) => document.id) } } });
    }

    console.log(JSON.stringify({
      status: "cleaned",
      removedServices: demoServices.map(({ id, name }) => ({ id, name })),
      removedOffers: offerIds.length,
      removedDemoKnowledgeDocuments: demoKnowledge.map(({ id, title }) => ({ id, title })),
      historicalQuoteRowsRetained: quoteReferences,
      historicalItineraryRowsRetained: itineraryReferences,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Demo catalog cleanup failed");
  process.exitCode = 1;
});
