# Frontend Sync and Plan Versions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current frontend use backend data for all business mutations and persist plan versions.

**Architecture:** Add a small fetch client and state adapter to the buildless frontend, retaining the existing rendering layer. Add backend snapshot APIs before replacing localStorage writes, then migrate legacy browser data once and retain only a versioned read-only cache.

**Tech Stack:** Vanilla JavaScript/CSS, Fetch API, Express/Prisma, Vitest/Supertest, existing Node QA scripts

**Spec:** `docs/superpowers/specs/2026-10-27-backend-fe-sync-design.md`

## Global Constraints

- Backend/PostgreSQL is authoritative; no queued offline writes.
- Offline cache is read-only and cannot overwrite server state.
- Preserve the approved unified quote and supplier catalog UI.
- A `409` refreshes server state and reports the conflict instead of silently retrying.

## Review Focus

- Slow or failed requests never duplicate a user mutation.
- Reloading during a write shows server state, not optimistic stale state.
- A second browser sees the same trip, quote and versions.
- Legacy import is safe to retry and never duplicates UUIDs.
- Restoring a version never mutates its saved snapshot.

---

### Task 1: Complete Trip persistence contract

**Files:**
- Modify: `backend/prisma/schema.prisma`, add migration and regenerate client
- Modify: `backend/src/modules/trips/{trip.types,trip.schemas,trip.repository,trip.service}.ts`
- Modify: `backend/src/modules/trips/infrastructure/{prisma-trip.repository,in-memory-trip.repository}.ts`
- Test: `backend/tests/{trip.service,trips.api,prisma-trip.repository}.test.ts`

**Interfaces:**
- Produces: persisted `adultCount`, `childCount`, `customerRequest`, `planningStarted`; migration from `travelers`.

- [ ] Write failing tests for create/get/update/legacy migration and date/count validation.
- [ ] Run focused tests; expect failure.
- [ ] Extend schema, migration and trip layers; keep API response additive during transition.
- [ ] Run focused tests and Prisma validation; expect PASS.
- [ ] Commit the trip contract.

### Task 2: Backend plan versions

**Files:**
- Modify: `backend/prisma/schema.prisma`, add migration and regenerate client
- Create: `backend/src/modules/versions/{version.types,version.schemas,version.repository,version.service,version.controller,version.routes}.ts`
- Create: `backend/src/modules/versions/infrastructure/prisma-version.repository.ts`
- Modify: `backend/src/app.ts`, `backend/src/server.ts`
- Test: `backend/tests/versions.api.test.ts`, `backend/tests/version.service.test.ts`

**Interfaces:**
- Produces: list/create/restore version APIs from the spec; immutable JSON snapshots.

- [ ] Write failing tests for pagination, snapshot contents, stale revision, restore transaction and immutable source snapshot.
- [ ] Run focused tests; expect failure.
- [ ] Implement schema and module; validate snapshot shape on both save and restore.
- [ ] Wire routes and run focused tests; expect PASS.
- [ ] Commit the version slice.

### Task 3: Frontend API client and hydration

**Files:**
- Create: `frontend/api-client.js`
- Modify: `frontend/index.html`, `frontend/redesign.js`
- Create: `scripts/qa/qa-api-sync.cjs`

**Interfaces:**
- Produces: `TripwiseApi` methods for trips, drafts, quotes, catalog, versions and agent runs; one configured base URL.

- [ ] Add failing QA assertions for timeout/error parsing, hydration, loading/read-only states and absence of direct business-state persistence.
- [ ] Run `node scripts/qa/qa-api-sync.cjs`; expect failure.
- [ ] Implement fetch client with timeout, JSON error envelope and idempotency header support.
- [ ] Add startup hydration and versioned cache write-through after successful reads only.
- [ ] Run QA; expect PASS.
- [ ] Commit the client/hydration slice.

### Task 4: Replace frontend mutations

**Files:**
- Modify: `frontend/redesign.js`, `frontend/redesign.css`
- Modify: `scripts/qa/qa-api-sync.cjs`, `scripts/qa/qa-supplier-offers.cjs`, `scripts/qa/qa-trips-dashboard.cjs`

**Interfaces:**
- Consumes: `TripwiseApi` from Task 3 and backend endpoints from prior plan.
- Produces: server-backed trip, itinerary, catalog, unified quote and version interactions.

- [ ] Add failing QA cases for every mutation, exact-control pending state, rollback/error toast, revision conflict refresh and price override badge.
- [ ] Run all frontend QA; expect failure.
- [ ] Replace local mutations with API calls and authoritative response replacement.
- [ ] Connect catalog selection/manual service/version save+restore and real agent status copy.
- [ ] Run all frontend QA; expect PASS.
- [ ] Commit the mutation slice.

### Task 5: One-time bootstrap and browser verification

**Files:**
- Create: backend bootstrap route inside `backend/src/modules/bootstrap/**`
- Modify: `backend/src/app.ts`, `backend/src/server.ts`, `frontend/redesign.js`
- Test: `backend/tests/bootstrap.api.test.ts`, `scripts/qa/qa-api-sync.cjs`

**Interfaces:**
- Produces: idempotent legacy import keyed by stable trip UUID and import key.

- [ ] Write failing tests for retry, partial duplicates, malformed payload and two-client import.
- [ ] Implement validated transactional import using the shared idempotency service.
- [ ] Add FE migration flag and remove legacy business writes.
- [ ] Run backend suite, all QA scripts, then browser smoke test refresh/cross-tab/offline/conflict flows.
- [ ] Commit the migration slice.

