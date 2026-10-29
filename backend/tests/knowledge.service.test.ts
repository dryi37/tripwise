import { describe, expect, it } from "vitest";
import { KnowledgeService, chunkKnowledgeText } from "../src/modules/knowledge/knowledge.service.js";
import type { EmbeddingProvider, KnowledgeDocument, KnowledgeRepository, VectorStore } from "../src/modules/knowledge/knowledge.types.js";

class MemoryKnowledge implements KnowledgeRepository {
  docs: KnowledgeDocument[] = [];
  async list(skip: number, take: number) { return { rows: this.docs.slice(skip, skip + take), total: this.docs.length }; }
  async findByHash(hash: string) { return this.docs.find((x) => x.contentHash === hash) ?? null; }
  async findById(id: string) { return this.docs.find((x) => x.id === id) ?? null; }
  async create(document: KnowledgeDocument) { this.docs.push(document); return document; }
  async setStatus(id: string, status: KnowledgeDocument['status']) { const doc = await this.findById(id); if (!doc) return null; doc.status = status; return doc; }
  async delete(id: string) { const index = this.docs.findIndex((x) => x.id === id); if (index < 0) return false; this.docs.splice(index, 1); return true; }
}
class FakeEmbedding implements EmbeddingProvider { async embed(texts: string[]) { return texts.map((_, index) => [index + 1, 0, 0]); } }
class FakeVectors implements VectorStore {
  points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> = [];
  searchedLimit = 0;
  async ensureCollection() {}
  async upsert(points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>) { this.points.push(...points); }
  async getPayloads(ids: string[]) { return this.points.filter((point) => ids.includes(point.id)).map(({ id, payload }) => ({ id, payload })); }
  async search(_vector: number[], limit: number) { this.searchedLimit = limit; return this.points.slice(0, limit).map((point, index) => ({ id: point.id, score: 0.9 - index * 0.1, payload: point.payload })); }
  async deleteByDocument(documentId: string) { this.points = this.points.filter((x) => x.payload.documentId !== documentId); }
  async deleteByIds(ids: string[]) { this.points = this.points.filter((x) => !ids.includes(x.id)); }
}

describe("knowledge service", () => {
  it("chunks by paragraphs with bounded overlap", () => {
    const chunks = chunkKnowledgeText("Một đoạn ngắn.\n\nĐoạn thứ hai dài hơn một chút.\n\nĐoạn thứ ba.", 40, 10);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 50)).toBe(true);
  });

  it("indexes once by content hash and returns source metadata", async () => {
    let id = 0; const repo = new MemoryKnowledge(); const vectors = new FakeVectors();
    const service = new KnowledgeService(repo, new FakeEmbedding(), vectors, { createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`, now: () => new Date("2026-10-27T10:00:00Z"), chunkSize: 40, chunkOverlap: 10, maxSearchLimit: 8 });
    const first = await service.create({ title: "Kinh nghiệm Seoul", sourceLabel: "Nội bộ", content: "Một đoạn ngắn.\n\nĐoạn thứ hai dài hơn một chút.\n\nĐoạn thứ ba." });
    const duplicate = await service.create({ title: "Bản trùng", sourceLabel: "Nội bộ", content: first.content });
    const results = await service.search("Seoul", 2);

    expect(duplicate.id).toBe(first.id);
    expect(repo.docs).toHaveLength(1);
    expect(results[0]).toMatchObject({ documentId: first.id, title: "Kinh nghiệm Seoul", sourceLabel: "Nội bộ" });
  });

  it("returns full document content by id without exposing chunks", async () => {
    const repo = new MemoryKnowledge();
    const service = new KnowledgeService(repo, new FakeEmbedding(), new FakeVectors(), { createId: () => "id", now: () => new Date(), chunkSize: 1_200, chunkOverlap: 150, maxSearchLimit: 5 });
    const created = await service.create({ title: "Seoul guide", sourceLabel: "Nội bộ", content: "Đây là nội dung hướng dẫn Seoul đầy đủ." });

    await expect(service.get(created.id)).resolves.toMatchObject({
      id: created.id,
      title: "Seoul guide",
      sourceLabel: "Nội bộ",
      content: "Đây là nội dung hướng dẫn Seoul đầy đủ.",
      status: "INDEXED",
    });
    await expect(service.get("missing")).rejects.toMatchObject({ status: 404, code: "KNOWLEDGE_NOT_FOUND" });
  });

  it("uses the configured limit for knowledge searches", async () => {
    const vectors = new FakeVectors();
    vectors.points = Array.from({ length: 8 }, (_, index) => ({ id: `chunk-${index}`, vector: [1, 0, 0], payload: { documentId: `doc-${index}`, chunkId: `chunk-${index}`, title: `Guide ${index}`, content: `Content ${index}` } }));
    const service = new KnowledgeService(new MemoryKnowledge(), new FakeEmbedding(), vectors, { createId: () => "id", now: () => new Date(), chunkSize: 1_200, chunkOverlap: 150, maxSearchLimit: 3 });

    const results = await service.search("Seoul", 20);

    expect(vectors.searchedLimit).toBe(3);
    expect(results).toHaveLength(3);
  });

  it("uses the configured result limit when no request override is supplied", async () => {
    const vectors = new FakeVectors();
    vectors.points = Array.from({ length: 8 }, (_, index) => ({ id: `chunk-${index}`, vector: [1, 0, 0], payload: { documentId: `doc-${index}`, chunkId: `chunk-${index}`, title: `Guide ${index}`, content: `Content ${index}` } }));
    const service = new KnowledgeService(new MemoryKnowledge(), new FakeEmbedding(), vectors, { createId: () => "id", now: () => new Date(), chunkSize: 1_200, chunkOverlap: 150, maxSearchLimit: 5 });

    const results = await service.search("Seoul");

    expect(vectors.searchedLimit).toBe(5);
    expect(results).toHaveLength(5);
  });
});
