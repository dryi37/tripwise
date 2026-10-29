# Supplier Offer Semantic Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove service descriptions and let the agent search supplier offers semantically using offer details combined with service, supplier, and price metadata.

**Architecture:** Keep one vector per supplier offer in a dedicated Qdrant collection. PostgreSQL remains authoritative: semantic IDs are hydrated from current rows before returning candidates. Offer/service/supplier edits refresh the related vectors, and startup re-indexes the existing catalog. Keyword search remains the fallback.

**Tech Stack:** TypeScript, Prisma/PostgreSQL, Gemini embeddings, Qdrant, existing Node QA scripts.

**Spec:** `docs/superpowers/specs/2026-10-28-catalog-offer-semantic-search-design.md`

## Global Constraints

- User-facing data field is “Thông tin chi tiết”; database and API use English `details`.
- Do not mix catalog vectors into the knowledge collection.
- Do not trust vector payload price/status; hydrate current PostgreSQL rows.
- Preserve existing quote snapshots and migrate service description text to linked offer details before dropping the column.
- Retain keyword-search recovery if embedding services are unavailable.

## Review Focus

- Old service descriptions survive migration in linked offer details.
- Supplier renames and service metadata edits refresh every affected offer vector.
- Unverified/inactive offers and inactive services never appear as selectable agent offers.
- Embedding/Qdrant failure does not block ordinary catalog/quote CRUD; agent search falls back to keyword results.
- Existing quote snapshots continue to display their captured details.

---

### Task 1: Rename catalog offer details and remove service description

**Files:** `backend/prisma/schema.prisma`, new migration, catalog types/schemas/service/repository, planning source mapping, seed script, generated Prisma client, tests.

- [ ] Add tests asserting catalog service create/update no longer accepts or stores a description and offer CRUD uses `details`.
- [ ] Verify the tests fail against current contracts.
- [ ] Add a migration that renames `supplier_offers.terms` to `details`, copies each linked service description into details, then drops `services.description`.
- [ ] Update Prisma/domain/API and planning quote snapshot mapping; keep quote snapshots named `termsSnapshot` for compatibility.
- [ ] Regenerate Prisma and run focused catalog/planning tests.

### Task 2: Build per-offer embedding index

**Files:** catalog indexing service/interface, Qdrant adapter, config, server composition, catalog/supplier services and repositories, tests.

- [ ] Test deterministic offer-document composition and vector lookup/hydration using fakes.
- [ ] Verify tests fail before implementation.
- [ ] Add `QDRANT_CATALOG_COLLECTION`, per-offer indexing/search/delete, startup re-index, and write-through refresh on service/offer/supplier changes.
- [ ] Keep failures recoverable and preserve keyword fallback.
- [ ] Run focused catalog index/service tests and backend typecheck.

### Task 3: Connect agent search and product form

**Files:** agent tool execution and result compaction, frontend `dist/api-sync.js` / `dist/redesign.js`, QA scripts.

- [ ] Test agent search delegates to semantic catalog results, and unavailable semantic search falls back to keyword matching.
- [ ] Change offer edit form and table label from “Điều kiện” to “Thông tin chi tiết”, posting `details`.
- [ ] Include the details and metadata in agent search results; preserve exact offer IDs and existing verified-offer guardrails.
- [ ] Run frontend QA, backend focused and full test suites, typecheck, build, Prisma validation, and inspect migration SQL.
- [ ] Update `PROGRESS.md` with verification and any live-environment limitation.
