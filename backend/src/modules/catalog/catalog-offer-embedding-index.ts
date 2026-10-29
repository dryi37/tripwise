import { createHash } from "node:crypto";
import type { CatalogOfferSearchIndex, CatalogOfferSearchRecord } from "./catalog.types.js";
import type { EmbeddingProvider, VectorPoint, VectorStore } from "../knowledge/knowledge.types.js";

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function buildCatalogOfferEmbeddingText({ service, offer }: CatalogOfferSearchRecord): string {
  return [
    `Service: ${service.name}`,
    `Category: ${service.category}`,
    service.tags?.length ? `Tags: ${service.tags.join(", ")}` : null,
    `Unit: ${service.unit}`,
    `Price: ${money(offer.unitPriceMinor)} ${offer.currency} / ${service.unit}`,
    offer.validFrom ? `Valid from: ${offer.validFrom}` : null,
    offer.validUntil ? `Valid until: ${offer.validUntil}` : null,
    `Verification status: ${offer.status}`,
    offer.details ? `Service and offer details: ${offer.details}` : null,
  ].filter(Boolean).join("\n");
}

function contentHash(record: CatalogOfferSearchRecord): string {
  return createHash("sha256").update(`${record.service.id}\n${buildCatalogOfferEmbeddingText(record)}`).digest("hex");
}

export class CatalogOfferEmbeddingIndex implements CatalogOfferSearchIndex {
  private collectionReady = false;

  constructor(private readonly embeddings: EmbeddingProvider, private readonly vectors: VectorStore) {}

  async indexOffer(record: CatalogOfferSearchRecord): Promise<void> {
    if (!record.service.isActive || record.offer.status !== "VERIFIED") {
      if ((await this.vectors.getPayloads([record.offer.id])).length) await this.vectors.deleteByIds([record.offer.id]);
      return;
    }
    const [vector] = await this.embeddings.embed([buildCatalogOfferEmbeddingText(record)]);
    if (!vector?.length) throw new Error("Embedding provider returned no vector for supplier offer");
    await this.ensureCollection(vector.length);
    await this.vectors.upsert([this.point(record, vector, contentHash(record))]);
  }

  async search(query: string, limit: number): Promise<string[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];
    const [vector] = await this.embeddings.embed([query.trim()]);
    if (!vector?.length) throw new Error("Embedding provider returned no query vector");
    await this.ensureCollection(vector.length);
    const results = await this.vectors.search(vector, limit);
    const ids = results.flatMap((result) => typeof result.payload.offerId === "string" ? [result.payload.offerId] : []);
    return [...new Set(ids)].slice(0, Math.max(0, limit));
  }

  async reindex(records: CatalogOfferSearchRecord[]): Promise<void> {
    if (!records.length) return;
    const searchable = records.filter((record) => record.service.isActive && record.offer.status === "VERIFIED");
    const existing = new Map((await this.vectors.getPayloads(records.map((record) => record.offer.id))).map((point) => [point.id, point.payload]));
    const ineligibleIds = records.filter((record) => (!record.service.isActive || record.offer.status !== "VERIFIED") && existing.has(record.offer.id)).map((record) => record.offer.id);
    const needingIndex = searchable.filter((record) => existing.get(record.offer.id)?.contentHash !== contentHash(record));
    if (!needingIndex.length) {
      if (ineligibleIds.length) await this.vectors.deleteByIds(ineligibleIds);
      return;
    }
    const vectors = await this.embeddings.embed(needingIndex.map(buildCatalogOfferEmbeddingText));
    if (vectors.length !== needingIndex.length || !vectors[0]?.length) throw new Error("Embedding response count does not match supplier offers");
    await this.ensureCollection(vectors[0].length);
    if (ineligibleIds.length) await this.vectors.deleteByIds(ineligibleIds);
    const points = needingIndex.map((record, index) => this.point(record, vectors[index]!, contentHash(record)));
    await this.vectors.upsert(points);
  }

  private async ensureCollection(vectorSize: number): Promise<void> {
    if (this.collectionReady) return;
    await this.vectors.ensureCollection(vectorSize);
    this.collectionReady = true;
  }

  private point(record: CatalogOfferSearchRecord, vector: number[], hash: string): VectorPoint {
    return { id: record.offer.id, vector, payload: { offerId: record.offer.id, serviceId: record.service.id, contentHash: hash } };
  }
}
