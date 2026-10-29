# Knowledge RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rebuildable local Qdrant knowledge index backed by authoritative PostgreSQL documents.

**Architecture:** PostgreSQL stores documents/chunks; an embedding provider and vector-store ports isolate Gemini and Qdrant. The knowledge service orchestrates indexing/search/deletion without making the rest of Tripwise depend on Qdrant availability.

**Tech Stack:** TypeScript, Express, Prisma/PostgreSQL, Qdrant local, Gemini embedding API, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-10-27-backend-fe-sync-design.md`

## Global Constraints

- No reranker and no local embedding model.
- PostgreSQL content is sufficient to rebuild Qdrant.
- Third-party responses are validated before use.
- Catalog/trip/quote APIs continue working when RAG dependencies fail.

## Review Focus

- Duplicate content hashes do not create duplicate vectors.
- Partial Qdrant failure leaves an observable recoverable state.
- Oversized or empty documents are rejected at the boundary.
- Delete failure never reports a clean successful deletion.
- Search results always include document source metadata and bounded chunk count.

---

### Task 1: Infrastructure and configuration

**Files:**
- Modify: `backend/docker-compose.yml`, `backend/.env.example`, `backend/src/config/env.ts`, `backend/package.json`
- Test: `backend/tests/env.test.ts`

**Interfaces:**
- Produces: `QDRANT_URL`, `QDRANT_COLLECTION`, `EMBEDDING_MODEL`, chunk/search limits.

- [ ] Write failing env tests for defaults and invalid limits.
- [ ] Add Qdrant service/healthcheck and dependencies, then extend environment parsing.
- [ ] Run env tests and `docker compose config`; expect PASS.
- [ ] Commit infrastructure.

### Task 2: Knowledge schema and ports

**Files:**
- Modify: `backend/prisma/schema.prisma`, add migration and regenerate client
- Create: `backend/src/modules/knowledge/{knowledge.types,knowledge.repository,embedding-provider,vector-store}.ts`
- Create: `backend/src/modules/knowledge/infrastructure/{prisma-knowledge.repository,gemini-embedding.provider,qdrant-vector.store}.ts`
- Test: `backend/tests/prisma-knowledge.repository.test.ts`, `backend/tests/knowledge-adapters.test.ts`

**Interfaces:**
- Produces: `EmbeddingProvider.embed(texts): Promise<number[][]>` and `VectorStore.upsert/search/delete` with validated DTOs.

- [ ] Write failing tests for document/chunk persistence and mocked malformed/failed provider responses.
- [ ] Implement schema, ports and adapters with strict response validation.
- [ ] Run focused tests; expect PASS.
- [ ] Commit schema/adapters.

### Task 3: Knowledge service and API

**Files:**
- Create: `backend/src/modules/knowledge/{knowledge.schemas,knowledge.service,knowledge.controller,knowledge.routes}.ts`
- Modify: `backend/src/app.ts`, `backend/src/server.ts`
- Test: `backend/tests/knowledge.service.test.ts`, `backend/tests/knowledge.api.test.ts`

**Interfaces:**
- Produces: document list/create/delete and search APIs from the spec; `KnowledgeService.search(query, limit)` for agent use.

- [ ] Write failing tests for paragraph chunking, overlap, content hash dedupe, index states, bounded search metadata and all review-focus failures.
- [ ] Implement deterministic chunker and service orchestration.
- [ ] Add schemas/controller/routes and dependency wiring.
- [ ] Run focused tests, full test suite, typecheck and build; expect PASS.
- [ ] Commit knowledge module.

### Task 4: Knowledge frontend

**Files:**
- Modify: `dist/redesign.js`, `dist/redesign.css`, `dist/api-client.js`
- Create: `scripts/qa/qa-knowledge.cjs`

**Interfaces:**
- Consumes: knowledge REST API.
- Produces: server-backed knowledge list, text-add form, indexing/error states and delete/search interactions.

- [ ] Write failing QA assertions for loading/indexed/failed/empty/search/delete states.
- [ ] Replace demo knowledge UI with API-backed interactions while retaining existing design language.
- [ ] Run QA and browser smoke tests; expect PASS.
- [ ] Commit knowledge UI.

