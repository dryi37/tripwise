# Agent Web Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the tour agent discover date-suitable places and public prices, persist cited external sources, and safely add linked itinerary and estimated quote items.

**Architecture:** Add a provider-neutral bounded web-search module, a persisted external-source module, and one controlled agent mutation that consumes only a server-issued external-source ID. Extend the existing Prisma planning records with external-source references and snapshots; expose read-only external sources through REST and map them into the existing approved frontend without changing its layout.

**Tech Stack:** TypeScript, Express, Prisma/PostgreSQL, LangGraph, Gemini function calling, Vitest, static JavaScript frontend.

**Spec:** `PROGRESS.md` sections 9 and 12.

## Global Constraints

- Preserve Route → Middleware → Controller → Service → Repository boundaries.
- Do not expose arbitrary model-provided prices or URLs to planning mutations.
- External prices remain estimates and visibly unverified; verified supplier offers remain authoritative.
- Bound provider time, search results, and agent tool calls; treat retrieved text as untrusted data.
- Do not change the approved interface layout.

## Review Focus

- Empty, timed-out, and malformed provider responses return safe structured failures without writes.
- Closed/date-incompatible results cannot be selected for an itinerary.
- Adult/child variants and currencies preserve original evidence and compute the intended quantity.
- Duplicate canonical sources and repeated agent calls do not duplicate source, itinerary, or quote rows.
- Stale or conflicting citations lower confidence and remain visible instead of being silently resolved.

---

### Task 1: Normalize and evaluate bounded web results

**Files:**
- Create: `backend/src/modules/web-search/web-search.types.ts`
- Create: `backend/src/modules/web-search/web-search.provider.ts`
- Create: `backend/src/modules/web-search/web-search.service.ts`
- Create: `backend/src/modules/web-search/infrastructure/tavily.web-search.provider.ts`
- Test: `backend/tests/web-search.service.test.ts`

**Interfaces:**
- Consumes: destination, trip dates, party composition, and a bounded query.
- Produces: `WebSearchService.search(input): Promise<WebSearchCandidate[]>` with normalized price, citation, hours/season/weather/date suitability, confidence, and conflicts.

- [ ] Write failing tests for empty results, timeout, malformed price/currency, audience variants, closures, weather constraints, stale/conflicting citations, and result caps.
- [ ] Run `npm test -- web-search.service.test.ts` and confirm failures are due to missing behavior.
- [ ] Implement the minimal types, service normalization/evaluation, and Tavily HTTP adapter with `AbortSignal.timeout`.
- [ ] Run the focused tests until green.

### Task 2: Persist and list external sources

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261027_external_sources/migration.sql`
- Create: `backend/src/modules/external-sources/external-source.types.ts`
- Create: `backend/src/modules/external-sources/external-source.repository.ts`
- Create: `backend/src/modules/external-sources/external-source.service.ts`
- Create: `backend/src/modules/external-sources/infrastructure/prisma-external-source.repository.ts`
- Create: `backend/tests/external-source.service.test.ts`

**Interfaces:**
- Consumes: normalized `WebSearchCandidate` records.
- Produces: deduplicated `ExternalSource` records keyed by stable provider result key/canonical URL, plus trip listing.

- [ ] Write failing tests for persistence, canonical deduplication, conflicts, citations, and trip association.
- [ ] Run the focused test and confirm RED.
- [ ] Add Prisma model/repository/service and migration, keeping evidence as typed JSON plus indexed fields.
- [ ] Run focused tests and `npx prisma generate`.

### Task 3: Controlled external-source planning mutation

**Files:**
- Modify: `backend/src/modules/planning/planning.types.ts`
- Modify: `backend/src/modules/planning/planning.repository.ts`
- Modify: `backend/src/modules/planning/planning.service.ts`
- Modify: `backend/src/modules/planning/infrastructure/in-memory-planning.repository.ts`
- Modify: `backend/src/modules/planning/infrastructure/prisma-planning.repository.ts`
- Test: `backend/tests/planning.service.test.ts`

**Interfaces:**
- Consumes: `externalSourceId`, itinerary timing, and quantity; loads price/citation from persistence.
- Produces: linked itinerary and `EXTERNAL` quote line snapshots with optimistic revision handling and duplicate prevention.

- [ ] Write failing tests proving arbitrary price/URL cannot enter the mutation, date-incompatible sources are rejected, totals are correct, and retries do not duplicate rows.
- [ ] Run focused tests and confirm RED.
- [ ] Extend planning types/repositories and implement the controlled mutation.
- [ ] Run focused tests until green.

### Task 4: Agent tools and prompt policy

**Files:**
- Modify: `backend/src/modules/agent/tour-agent.schemas.ts`
- Modify: `backend/src/modules/agent/tour-agent.service.ts`
- Modify: `backend/src/modules/agent/infrastructure/gemma-agent.model.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.example`
- Test: `backend/tests/tour-agent.service.test.ts`
- Test: `backend/tests/gemma-agent.model.test.ts`

**Interfaces:**
- Produces tools `search_web` and `add_place_from_external_source`; search persists server-issued IDs and selection performs controlled linked writes.

- [ ] Write failing tests for search deduplication/bounds, source-ID enforcement, closed candidates, duplicates, and prompt/tool declarations.
- [ ] Run focused tests and confirm RED.
- [ ] Implement schemas, orchestration dependencies, tool execution, declarations, and policy prompt.
- [ ] Run focused tests until green.

### Task 5: External-source API and existing UI data binding

**Files:**
- Create: `backend/src/modules/external-sources/external-source.schemas.ts`
- Create: `backend/src/modules/external-sources/external-source.controller.ts`
- Create: `backend/src/modules/external-sources/external-source.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `frontend/api-client.js`
- Modify: `frontend/api-sync.js`
- Modify: `frontend/redesign.js`
- Test: `backend/tests/external-sources.api.test.ts`
- Modify: frontend QA scripts only if assertions need the new persisted data contract.

**Interfaces:**
- Produces `GET /api/v1/trips/:tripId/external-sources`; maps sources and linked quote/activity metadata into the current `Bên ngoài` filter/cards/rows.

- [ ] Write failing API and mapping/QA tests for citations, confidence, date constraints, and verification labels.
- [ ] Run focused tests and confirm RED.
- [ ] Implement routes and data mapping with existing DOM/classes only.
- [ ] Run focused backend tests and frontend QA.

### Task 6: Full verification and handoff

**Files:**
- Modify: `PROGRESS.md`
- Modify: `backend/README.md`

- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, and `npx prisma validate` in `backend`.
- [ ] Run all four frontend QA scripts at repository root.
- [ ] Review the final diff/files for secrets and unintended UI changes.
- [ ] Update `PROGRESS.md` and `backend/README.md` with implemented behavior, configuration, migrations, tests, and remaining operational limitations.
