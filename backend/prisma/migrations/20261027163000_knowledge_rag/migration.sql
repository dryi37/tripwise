CREATE TYPE "KnowledgeStatus" AS ENUM ('PENDING', 'INDEXED', 'FAILED');
CREATE TABLE "knowledge_documents" (
  "id" UUID NOT NULL, "title" VARCHAR(200) NOT NULL, "source_label" VARCHAR(200), "content" TEXT NOT NULL,
  "status" "KnowledgeStatus" NOT NULL DEFAULT 'PENDING', "content_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "knowledge_chunks" (
  "id" UUID NOT NULL, "document_id" UUID NOT NULL, "ordinal" INTEGER NOT NULL, "content" TEXT NOT NULL,
  "qdrant_point_id" UUID NOT NULL, "token_estimate" INTEGER NOT NULL,
  CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "knowledge_documents_content_hash_key" ON "knowledge_documents"("content_hash");
CREATE INDEX "knowledge_documents_created_at_id_idx" ON "knowledge_documents"("created_at", "id");
CREATE UNIQUE INDEX "knowledge_chunks_qdrant_point_id_key" ON "knowledge_chunks"("qdrant_point_id");
CREATE UNIQUE INDEX "knowledge_chunks_document_id_ordinal_key" ON "knowledge_chunks"("document_id", "ordinal");
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
