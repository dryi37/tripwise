# Catalog and Quote Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build persistent supplier, service, offer and source-aware quote APIs.

**Architecture:** Extend the current Express/Prisma modular monolith with `suppliers` and `catalog` modules, then enhance `planning` through repository transactions. Every HTTP module keeps Route → Middleware → Controller → Service → Repository.

**Tech Stack:** TypeScript, Express 5, Prisma 7, PostgreSQL 17, Zod 4, Vitest/Supertest

**Spec:** `docs/superpowers/specs/2026-10-27-backend-fe-sync-design.md`

## Global Constraints

- PostgreSQL is authoritative; money uses integer minor units.
- No authentication or authorization in this phase.
- All writes validate at the HTTP boundary and return the existing structured API error envelope.
- Quote totals are computed server-side and stale revisions return `409 REVISION_CONFLICT`.
- Use TDD and preserve existing endpoint contracts where the spec does not replace them.

## Review Focus

- Concurrent preferred-offer changes leave exactly one preferred offer.
- Expired, inactive or unverified offers cannot silently appear verified in a quote.
- Reusing an idempotency key with a different body returns `422`.
- Manual catalog save reuses supplier names case-insensitively but creates a new service.
- Editing a catalog-derived price preserves its source and sets `PRICE_OVERRIDDEN`.

---

### Task 1: Prisma catalog and quote schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_catalog_quote_sources/migration.sql`
- Modify: `backend/src/generated/prisma/**` via `npm run prisma:generate`
- Test: `backend/tests/prisma-catalog.repository.test.ts`

**Interfaces:**
- Produces: Prisma models `Supplier`, `Service`, `SupplierOffer`, `IdempotencyRecord`; enums and quote snapshot fields defined by the spec.

- [ ] Write a failing repository integration test proving relations, unique normalized supplier name, quote snapshots and one preferred offer invariant.
- [ ] Run `npm test -- prisma-catalog.repository.test.ts`; expect failure because models do not exist.
- [ ] Add Prisma models/enums/relations, migrate existing quote rows as `MANUAL`, add database constraints/indexes, and generate the client.
- [ ] Run the focused test and `npx prisma validate`; expect PASS.
- [ ] Commit the schema slice.

### Task 2: Supplier module

**Files:**
- Create: `backend/src/modules/suppliers/{supplier.types,supplier.schemas,supplier.repository,supplier.service,supplier.controller,supplier.routes}.ts`
- Create: `backend/src/modules/suppliers/infrastructure/prisma-supplier.repository.ts`
- Modify: `backend/src/app.ts`, `backend/src/server.ts`
- Test: `backend/tests/suppliers.api.test.ts`, `backend/tests/supplier.service.test.ts`

**Interfaces:**
- Produces: `SupplierService.list/create/update`; REST `GET/POST /api/v1/suppliers`, `PATCH /api/v1/suppliers/:supplierId`.

- [ ] Write failing service/API tests for pagination, validation, exact normalized-name reuse and not-found behavior.
- [ ] Run the focused tests; expect missing module/routes.
- [ ] Implement repository, service, controller and router with Zod boundary schemas.
- [ ] Wire dependencies in `createApp` and `server.ts`.
- [ ] Run focused tests; expect PASS.
- [ ] Commit the supplier slice.

### Task 3: Catalog service and offer module

**Files:**
- Create: `backend/src/modules/catalog/{catalog.types,catalog.schemas,catalog.repository,catalog.service,catalog.controller,catalog.routes}.ts`
- Create: `backend/src/modules/catalog/infrastructure/prisma-catalog.repository.ts`
- Modify: `backend/src/app.ts`, `backend/src/server.ts`
- Test: `backend/tests/catalog.api.test.ts`, `backend/tests/catalog.service.test.ts`

**Interfaces:**
- Consumes: supplier lookup/create from Task 2.
- Produces: paginated catalog REST contracts and `CatalogService.getOfferForQuote(offerId)`.

- [ ] Write failing tests for query/category/status pagination, CRUD validation, offer validity and transactional preferred selection under competing updates.
- [ ] Run focused tests; expect failure.
- [ ] Implement catalog types, repository transaction methods, service rules, controller and routes.
- [ ] Run focused tests; expect PASS.
- [ ] Commit the catalog slice.

### Task 4: Source-aware quote mutations

**Files:**
- Modify: `backend/src/modules/planning/{planning.types,planning.schemas,planning.repository,planning.service,planning.controller,planning.routes}.ts`
- Modify: `backend/src/modules/planning/infrastructure/{prisma-planning.repository,in-memory-planning.repository}.ts`
- Create: `backend/src/shared/idempotency/{idempotency.repository,idempotency.service}.ts`
- Create: `backend/src/shared/idempotency/prisma-idempotency.repository.ts`
- Test: `backend/tests/planning.api.test.ts`, `backend/tests/planning.service.test.ts`, `backend/tests/prisma-planning.repository.test.ts`

**Interfaces:**
- Consumes: `CatalogService.getOfferForQuote`.
- Produces: `addQuoteItemFromOffer`, `addManualQuoteItem`; endpoints `/items/from-offer` and `/items/manual`.

- [ ] Write failing tests for snapshot immutability, invalid offer states, server totals, manual save modes, supplier reuse, price override, revision conflicts and all idempotency review-focus cases.
- [ ] Run focused tests; expect failure.
- [ ] Extend planning contracts and implement each mutation through one Prisma transaction.
- [ ] Add atomic idempotency claim/replay with request hash and `409` for in-flight duplicates.
- [ ] Keep legacy quote-create endpoint compatible by treating it as manual, then wire new routes.
- [ ] Run focused tests; expect PASS.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, and `npx prisma validate`; expect all PASS.
- [ ] Commit the quote slice.

