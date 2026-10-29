# One Price Per Service and Search Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Enforce at most one unit-price record per service and configure each agent search tool's result count centrally.

**Architecture:** Keep `SupplierOffer` as the stable source row linked by quote and itinerary history, but make its relation to `Service` one-to-one in Prisma and PostgreSQL. Migrate existing extra prices into cloned service records without changing offer IDs. Require `AGENT_SEARCH_RESULTS_PER_TOOL` from the environment and use it in web, knowledge, and catalog search; the model tool schemas do not accept a result count.

**Tech Stack:** TypeScript, Express, Zod, Prisma, PostgreSQL, Qdrant, static JavaScript frontend, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-one-price-per-service-design.md`

## Global Constraints

- Each individual tool invocation for `search_web`, `search_knowledge`, and `search_supplier_offers` uses the backend `AGENT_SEARCH_RESULTS_PER_TOOL` setting independently; the model cannot set the count.
- Only active services with `VERIFIED` prices are indexed and returned by internal catalog search.
- Preserve existing `SupplierOffer.id`, `QuoteItem` source links, itinerary links, and the current catalog API response shape (`offers: []` or `[one offer]`).
- Existing duplicate prices become separate service rows; do not discard prices.
- Existing services with no price remain valid; the relationship permits zero or one offer.

## Review Focus

- A service already has a price: concurrent create requests must not bypass the uniqueness rule; database unique violation maps to `409 SERVICE_PRICE_EXISTS`.
- A service has multiple old prices: migration must retain each offer and update quote references consistently.
- The configured search result count changes: each provider/service uses that backend setting without a model-supplied count.
- A service has no price: it remains listable and can receive its first offer.
- A price becomes unverified/inactive: it is not returned by agent search or indexed in Qdrant.

---

### Task 1: Configure result counts for each search tool

**Files:**
- Modify: `backend/src/modules/agent/tour-agent.schemas.ts`
- Modify: `backend/src/modules/agent/tour-agent.service.ts`
- Modify: `backend/src/modules/knowledge/knowledge.schemas.ts`
- Modify: `backend/src/modules/knowledge/knowledge.service.ts`
- Modify: `backend/src/modules/web-search/web-search.service.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.example`
- Test: `backend/tests/tour-agent.schemas.test.ts`
- Test: `backend/tests/knowledge.service.test.ts`
- Test: `backend/tests/web-search.service.test.ts`

**Interfaces:**
- The model tool schemas accept query/category only; result counts are not model inputs.
- Required environment configuration `AGENT_SEARCH_RESULTS_PER_TOOL` is shared by web, knowledge, and catalog search services. Dev/example configuration is 5.
- Backend services use their configured result count and expose no caller-controlled override from the agent tool.

- [x] Add tests that the model cannot supply a result count and services follow configured result counts.
- [x] Run the focused tests and confirm they fail against current behavior.
- [x] Implement query-only model schemas and inject the shared configured count into knowledge, web, and catalog search.
- [x] Require `AGENT_SEARCH_RESULTS_PER_TOOL` from the environment; set its sample/local value to five.
- [x] Run focused tests and typecheck.

### Task 2: Enforce one optional offer per service in the database and backend

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261029120000_one_offer_per_service/migration.sql`
- Modify: `backend/src/modules/catalog/catalog.types.ts`
- Modify: `backend/src/modules/catalog/infrastructure/prisma-catalog.repository.ts`
- Modify: `backend/src/modules/catalog/catalog.service.ts`
- Modify: `backend/src/modules/catalog/catalog.controller.ts` or repository error mapping as needed
- Modify: `backend/src/modules/catalog/catalog.schemas.ts` if the service-price contract needs adjustment
- Test: `backend/tests/catalog.api.test.ts`
- Test: `backend/tests/catalog-offer-embedding-index.test.ts`

**Interfaces:**
- Prisma `Service.offer` is singular optional; `SupplierOffer.serviceId` is unique.
- Internal `ServiceRecord.offer` is `SupplierOfferRecord | null`.
- Existing catalog HTTP output continues to serialize `offers: []` or `offers: [offer]`.
- Creating a second price for the same service returns `409 SERVICE_PRICE_EXISTS`; updating the existing price remains supported.

- [x] Add tests for an empty service receiving its first price, duplicate create rejection, update success, and API compatibility output with a singleton/empty array.
- [x] Add a repository/API test for a unique-constraint conflict so concurrent duplicate creation maps to the same `409` response.
- [x] Run focused catalog tests and confirm they fail against current behavior.
- [x] Implement singular Prisma and internal types, unique `serviceId`, explicit pre-check, and unique-conflict mapping.
- [x] Keep the service search and embedding eligibility rules limited to active services with verified prices.
- [x] Run Prisma format/validation/generation, focused tests, and backend typecheck.

### Task 3: Preserve existing catalog and quote history in the migration

**Files:**
- Modify: `backend/prisma/migrations/20261029120000_one_offer_per_service/migration.sql`
- Test: `backend/tests/catalog-migration.test.ts` or a migration SQL verification script under `backend/scripts/`
- Reference: `backend/prisma/schema.prisma` and `backend/src/modules/versions/`

- [x] Add a migration verification fixture covering a service with no price, one price, and multiple prices; assert no offer is discarded and every quote's `serviceId` agrees with its `supplierOfferId` after splitting.
- [x] Choose the keeper deterministically: verified first, then newest `updatedAt`, then offer ID ascending.
- [x] For every non-keeper offer, clone service fields to a new service UUID, reassign the offer while preserving its ID, and update linked `QuoteItem.serviceId`.
- [x] Add the unique database constraint only after duplicates have been split.
- [x] Apply the migration to a disposable PostgreSQL database and inspect service/offer/quote link counts before and after.
- [x] Apply to the configured local development database after the disposable migration check passes.

### Task 4: Verify consumers and complete regression checks

**Files:**
- Modify as needed: `backend/src/modules/agent/infrastructure/gemma-agent.model.ts`
- Modify as needed: `dist/api-sync.js`, `dist/redesign.js`
- Test: agent context/schema tests and `node` QA scripts for catalog UI/API sync

- [x] Verify agent prompt and tool declarations describe only one verified internal price per service; tool counts come from backend configuration.
- [x] Verify the flat catalog still displays one row per service price and a duplicate-price error is actionable.
- [x] Run all relevant frontend syntax and QA checks.
- [x] Run the full backend suite, backend typecheck, Prisma validation, and build.
- [x] Review local database row counts and Qdrant behavior after migration; confirm all old offer IDs and quote/itinerary references remain.

## Repository notes

- The workspace currently has no Git metadata at its root or backend root; do not create commits as part of this plan.
- The local development database has prior migrations applied. The schema migration changes local persisted data by splitting duplicated service/offer relationships, while preserving offer IDs and linked quote rows.

