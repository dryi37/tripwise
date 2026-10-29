import { createHash } from "node:crypto";
import { ApiError } from "../../shared/http/api-error.js";
import type { EmbeddingProvider, KnowledgeDocument, KnowledgeRepository, VectorStore } from "./knowledge.types.js";

export function chunkKnowledgeText(content: string, size: number, overlap: number): string[] {
  const paragraphs = content.trim().split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  const flush = () => { if (current) chunks.push(current); current = ""; };
  for (const paragraph of paragraphs) {
    if (paragraph.length > size) {
      flush();
      const step = Math.max(1, size - overlap);
      for (let offset = 0; offset < paragraph.length; offset += step) chunks.push(paragraph.slice(offset, offset + size));
      continue;
    }
    const combined = current ? `${current}\n\n${paragraph}` : paragraph;
    if (combined.length > size) { flush(); current = paragraph; } else current = combined;
  }
  flush();
  return chunks;
}

interface KnowledgeDependencies { createId: () => string; now: () => Date; chunkSize: number; chunkOverlap: number; maxSearchLimit: number }
export class KnowledgeService {
  constructor(private readonly repository: KnowledgeRepository, private readonly embeddings: EmbeddingProvider, private readonly vectors: VectorStore, private readonly dependencies: KnowledgeDependencies) {}
  async list(page: number, pageSize: number) { const result = await this.repository.list((page - 1) * pageSize, pageSize); return { data: result.rows.map(({ content, chunks: _chunks, ...row }) => ({ ...row, preview: Array.from(content).slice(0, 600).join("") })), pagination: { page, pageSize, totalItems: result.total, totalPages: Math.ceil(result.total / pageSize) } }; }
  async get(id: string) {
    const document = await this.repository.findById(id);
    if (!document) throw new ApiError(404, "KNOWLEDGE_NOT_FOUND", "Knowledge document not found");
    const { id: documentId, title, sourceLabel, content, status, createdAt, updatedAt } = document;
    return { id: documentId, title, sourceLabel, content, status, createdAt, updatedAt };
  }
  async create(input: { title: string; sourceLabel?: string | null | undefined; content: string }) {
    const content = input.content.trim();
    const contentHash = createHash("sha256").update(content).digest("hex");
    const duplicate = await this.repository.findByHash(contentHash); if (duplicate) return duplicate;
    const now = this.dependencies.now(), id = this.dependencies.createId();
    const texts = chunkKnowledgeText(content, this.dependencies.chunkSize, this.dependencies.chunkOverlap);
    const chunks = texts.map((text, ordinal) => ({ id: this.dependencies.createId(), documentId: id, ordinal, content: text, qdrantPointId: this.dependencies.createId(), tokenEstimate: Math.ceil(text.length / 4) }));
    let document = await this.repository.create({ id, title: input.title, sourceLabel: input.sourceLabel ?? null, content, status: "PENDING", contentHash, createdAt: now, updatedAt: now, chunks });
    try {
      const vectors = await this.embeddings.embed(texts);
      if (vectors.length !== chunks.length || !vectors[0]?.length) throw new Error("Embedding response count does not match chunks");
      await this.vectors.ensureCollection(vectors[0].length);
      await this.vectors.upsert(chunks.map((chunk, index) => ({ id: chunk.qdrantPointId, vector: vectors[index]!, payload: { documentId: id, chunkId: chunk.id, ordinal: chunk.ordinal, title: input.title, sourceLabel: input.sourceLabel ?? null, content: chunk.content } })));
      document = (await this.repository.setStatus(id, "INDEXED")) ?? document;
      return document;
    } catch (error) {
      await this.repository.setStatus(id, "FAILED");
      throw new ApiError(503, "KNOWLEDGE_INDEX_FAILED", "Could not index the knowledge document", { cause: error instanceof Error ? error.message : "unknown" });
    }
  }
  async search(query: string, requestedLimit?: number) {
    const maxSearchLimit = this.dependencies.maxSearchLimit;
    const limit = Math.min(requestedLimit ?? maxSearchLimit, maxSearchLimit);
    const [vector] = await this.embeddings.embed([query]); if (!vector?.length) throw new ApiError(503, "EMBEDDING_FAILED", "Could not embed the search query");
    const results = await this.vectors.search(vector, limit);
    return results.slice(0, limit).map((result) => ({ documentId: String(result.payload.documentId), chunkId: String(result.payload.chunkId), title: String(result.payload.title), sourceLabel: result.payload.sourceLabel == null ? null : String(result.payload.sourceLabel), content: String(result.payload.content), score: result.score }));
  }
  async delete(id: string) { if (!await this.repository.findById(id)) throw new ApiError(404, "KNOWLEDGE_NOT_FOUND", "Knowledge document not found"); try { await this.vectors.deleteByDocument(id); } catch { await this.repository.setStatus(id, "FAILED"); throw new ApiError(503, "KNOWLEDGE_DELETE_FAILED", "Could not delete vectors; document was retained"); } await this.repository.delete(id); }
}
