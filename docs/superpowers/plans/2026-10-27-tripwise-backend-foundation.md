# Tripwise Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a runnable and tested Express/TypeScript backend with Prisma/PostgreSQL and the requested Route → Middleware → Controller → Service → Repository layering.

**Architecture:** Build a modular monolith under `backend/`. Implement one complete Trips vertical slice behind repository interfaces, with an in-memory repository for fast contract tests and a Prisma repository for production.

**Tech Stack:** Node.js, TypeScript, Express 5, Prisma ORM 7, PostgreSQL, Zod, Vitest, Supertest

**Spec:** `docs/superpowers/specs/2026-10-27-tripwise-backend-foundation-design.md`

## Global Constraints

- Preserve the existing buildless frontend under `dist/`.
- Use `/api/v1`, UUID identifiers, camelCase JSON, cursor pagination, structured errors, and optimistic revision checks.
- Keep model/network calls outside database transactions.
- Do not implement agent, retrieval, auth, or frontend integration in this slice.

## Review Focus

- Invalid dates and end dates before start dates return `422` without calling persistence.
- A missing trip returns the same structured `404` shape from read and update routes.
- A stale `expectedRevision` returns `409` and does not overwrite the trip.
- Unknown body fields are rejected instead of silently persisted.
- Cursor pagination has stable ordering and a nullable `nextCursor`.

---

### Task 1: Tooling and health contract

**Files:** Create `backend/package.json`, `backend/tsconfig.json`, `backend/src/app.ts`, `backend/src/server.ts`, middleware, and health route/test files.

**Interfaces:** Produces `createApp(dependencies): Express` and the structured API error contract.

- [ ] Write a Supertest asserting `GET /api/v1/health` returns `{ data: { status: "ok" } }` and unknown routes return structured `404`.
- [ ] Run the test and verify it fails because the app does not exist.
- [ ] Implement the minimal app, routing, not-found, and error middleware.
- [ ] Run tests and typecheck.

### Task 2: Trip service and repository contract

**Files:** Create trip domain types, repository interface, service, in-memory repository, and unit tests.

**Interfaces:** Produces `TripRepository` and `TripService` create/get/list/update operations.

- [ ] Write failing service tests for creation, invalid dates, missing trip, and revision conflict.
- [ ] Run the tests and verify expected missing-module failures.
- [ ] Implement the domain contract and minimal service behavior.
- [ ] Run tests and typecheck.

### Task 3: Trips HTTP vertical slice

**Files:** Create trip schemas, validation middleware, controller, routes, composition root, and API tests.

**Interfaces:** Produces the five `/api/v1/trips` endpoints from the design.

- [ ] Write failing API tests for create/list/get/update and structured validation errors.
- [ ] Run the tests and verify routes return `404`.
- [ ] Implement middleware, controller, routes, and dependency composition.
- [ ] Run tests and typecheck.

### Task 4: Prisma and local PostgreSQL adapter

**Files:** Create Prisma schema/config/client/repository, Docker Compose, `.env.example`, README, and Prisma repository contract tests where feasible.

**Interfaces:** Produces `PrismaTripRepository` implementing `TripRepository` and production startup wiring.

- [ ] Write a compile-time/behavioral contract test against the repository interface.
- [ ] Generate Prisma Client and implement the adapter.
- [ ] Verify Prisma schema formatting/validation, tests, typecheck, and build.
- [ ] Document local database, migration, test, and run commands.

