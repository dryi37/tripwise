export type KnowledgeStatus = "PENDING" | "INDEXED" | "FAILED";
export interface KnowledgeChunk { id: string; documentId: string; ordinal: number; content: string; qdrantPointId: string; tokenEstimate: number }
export interface KnowledgeDocument { id: string; title: string; sourceLabel: string | null; content: string; status: KnowledgeStatus; contentHash: string; createdAt: Date; updatedAt: Date; chunks: KnowledgeChunk[] }
export interface KnowledgeRepository {
  list(skip: number, take: number): Promise<{ rows: KnowledgeDocument[]; total: number }>;
  findByHash(hash: string): Promise<KnowledgeDocument | null>;
  findById(id: string): Promise<KnowledgeDocument | null>;
  create(document: KnowledgeDocument): Promise<KnowledgeDocument>;
  setStatus(id: string, status: KnowledgeStatus): Promise<KnowledgeDocument | null>;
  delete(id: string): Promise<boolean>;
}
export interface EmbeddingProvider { embed(texts: string[]): Promise<number[][]> }
export interface VectorPoint { id: string; vector: number[]; payload: Record<string, unknown> }
export interface VectorSearchResult { id: string; score: number; payload: Record<string, unknown> }
export interface VectorStore { ensureCollection(vectorSize: number): Promise<void>; upsert(points: VectorPoint[]): Promise<void>; getPayloads(ids: string[]): Promise<Array<{ id: string; payload: Record<string, unknown> }>>; search(vector: number[], limit: number): Promise<VectorSearchResult[]>; deleteByDocument(documentId: string): Promise<void>; deleteByIds(ids: string[]): Promise<void> }
