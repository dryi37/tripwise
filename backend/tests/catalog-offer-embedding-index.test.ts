import { describe, expect, it } from "vitest";
import { buildCatalogOfferEmbeddingText, CatalogOfferEmbeddingIndex } from "../src/modules/catalog/catalog-offer-embedding-index.js";
import type { CatalogOfferSearchRecord } from "../src/modules/catalog/catalog.types.js";
import type { EmbeddingProvider, VectorPoint, VectorStore } from "../src/modules/knowledge/knowledge.types.js";

const record: CatalogOfferSearchRecord = {
  service: { id: "service-1", name: "Xe riêng tham quan Seoul", category: "Di chuyển", tags: ["FAMILY", "ACCESSIBLE"], unit: "xe/ngày", isActive: true },
  offer: { id: "offer-1", serviceId: "service-1", unitPriceMinor: 3_000_000, currency: "VND", validFrom: "2026-01-01", validUntil: "2027-12-31", details: "Xe 7 chỗ, tối đa 8 giờ/ngày.", status: "VERIFIED", createdAt: new Date(), updatedAt: new Date() },
};

class FakeVectors implements VectorStore {
  points: VectorPoint[] = [];
  upserted: VectorPoint[] = [];
  deleted: string[] = [];
  collectionReady = false;
  async ensureCollection() { this.collectionReady = true; }
  async upsert(points: VectorPoint[]) {
    this.upserted.push(...points);
    for (const point of points) {
      const existing = this.points.findIndex((item) => item.id === point.id);
      if (existing >= 0) this.points[existing] = point;
      else this.points.push(point);
    }
  }
  async search() { return this.points.map((point) => ({ id: point.id, score: 0.9, payload: point.payload })); }
  async deleteByDocument() {}
  async deleteByIds(ids: string[]) { if (!this.collectionReady) throw new Error("Qdrant returned 404"); this.deleted.push(...ids); this.points = this.points.filter((point) => !ids.includes(point.id)); }
  async getPayloads(ids: string[]) { return this.points.filter((point) => ids.includes(point.id)).map(({ id, payload }) => ({ id, payload })); }
}

class FakeEmbeddings implements EmbeddingProvider {
  inputs: string[][] = [];
  async embed(texts: string[]) { this.inputs.push(texts); return texts.map(() => [0.1, 0.2, 0.3]); }
}

describe("CatalogOfferEmbeddingIndex", () => {
  it("builds a per-offer embedding document from service and offer metadata", () => {
    const text = buildCatalogOfferEmbeddingText(record);
    expect(text).toContain("Xe riêng tham quan Seoul");
    expect(text).not.toContain("Supplier:");
    expect(text).toContain("Xe 7 chỗ");
    expect(text).toContain("Tags: FAMILY, ACCESSIBLE");
    expect(text).toContain("3,000,000 VND / xe/ngày");
    expect(text).toContain("2027-12-31");
  });

  it("indexes active offers with any verification status and removes them when the service becomes inactive", async () => {
    const vectors = new FakeVectors();
    const embeddings = new FakeEmbeddings();
    const index = new CatalogOfferEmbeddingIndex(embeddings, vectors);
    await index.indexOffer(record);
    await index.indexOffer({ ...record, service: { ...record.service, isActive: false } });

    expect(embeddings.inputs[0]?.[0]).toContain("Xe riêng tham quan Seoul");
    expect(vectors.upserted[0]).toMatchObject({ id: "offer-1", payload: { offerId: "offer-1", serviceId: "service-1" } });
    expect(vectors.deleted).toEqual(["offer-1"]);
  });

  it("does not index an unverified offer for agent search", async () => {
    const vectors = new FakeVectors();
    const embeddings = new FakeEmbeddings();
    const index = new CatalogOfferEmbeddingIndex(embeddings, vectors);
    const unverified = { ...record, offer: { ...record.offer, status: "UNVERIFIED" as const } };
    await index.indexOffer(unverified);

    expect(vectors.upserted).toHaveLength(0);
    expect(vectors.points).toHaveLength(0);
    expect(embeddings.inputs).toHaveLength(0);
    expect(vectors.deleted).toEqual([]);
  });

  it("removes stale unverified points during startup sync", async () => {
    const vectors = new FakeVectors();
    const index = new CatalogOfferEmbeddingIndex(new FakeEmbeddings(), vectors);
    vectors.points.push({ id: "inactive-offer", vector: [0.1, 0.2, 0.3], payload: { offerId: "inactive-offer", serviceId: "service-1" } });

    await expect(index.reindex([
      record,
      { ...record, offer: { ...record.offer, id: "inactive-offer", status: "UNVERIFIED" } },
    ])).resolves.toBeUndefined();

    expect(vectors.collectionReady).toBe(true);
    expect(vectors.deleted).toEqual(["inactive-offer"]);
    expect(vectors.points.map((point) => point.id)).toEqual(["offer-1"]);
  });

  it("reuses existing vectors on later startup reindexes when offer content is unchanged", async () => {
    const vectors = new FakeVectors();
    const embeddings = new FakeEmbeddings();
    const index = new CatalogOfferEmbeddingIndex(embeddings, vectors);

    await index.reindex([record]);
    await index.reindex([record]);

    expect(embeddings.inputs).toHaveLength(1);
    expect(vectors.points).toHaveLength(1);
    expect(vectors.points[0]?.payload.contentHash).toEqual(expect.any(String));
  });

  it("re-embeds only an offer whose searchable content changed", async () => {
    const vectors = new FakeVectors();
    const embeddings = new FakeEmbeddings();
    const index = new CatalogOfferEmbeddingIndex(embeddings, vectors);
    const second = { ...record, offer: { ...record.offer, id: "offer-2" } };

    await index.reindex([record, second]);
    const changed = { ...record, offer: { ...record.offer, details: "Xe 9 chỗ, tối đa 10 giờ/ngày." } };
    await index.reindex([changed, second]);

    expect(embeddings.inputs).toHaveLength(2);
    expect(embeddings.inputs[1]).toHaveLength(1);
    expect(vectors.points).toHaveLength(2);
    expect(vectors.points[0]?.payload.contentHash).toEqual(expect.any(String));
  });

  it("refreshes the vector payload when an offer moves to a cloned service", async () => {
    const vectors = new FakeVectors();
    const embeddings = new FakeEmbeddings();
    const index = new CatalogOfferEmbeddingIndex(embeddings, vectors);

    await index.reindex([record]);
    await index.reindex([{ ...record, service: { ...record.service, id: "service-clone" } }]);

    expect(vectors.points[0]?.payload.serviceId).toBe("service-clone");
  });

  it("does not return vector points without a server-issued offer id", async () => {
    const vectors = new FakeVectors();
    vectors.points.push({ id: "not-an-offer-id", vector: [0.1, 0.2, 0.3], payload: {} });
    const index = new CatalogOfferEmbeddingIndex(new FakeEmbeddings(), vectors);

    await expect(index.search("xe Seoul", 5)).resolves.toEqual([]);
  });
});
