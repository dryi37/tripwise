# Itinerary Draft and Quote Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tested itinerary draft and deterministic quote APIs to the current Tripwise Express backend.

**Architecture:** Add a planning vertical slice with domain contracts, service rules, repository interface, in-memory test adapter, Prisma adapter, HTTP validation and routes. Keep the existing Trips module unchanged except for application composition.

**Tech Stack:** TypeScript, Express 5, Prisma ORM 7, PostgreSQL, Zod, Vitest, Supertest

**Spec:** `docs/superpowers/specs/2026-10-27-itinerary-quote-backend-design.md`

## Global Constraints

- Preserve Route → Middleware → Controller → Service → Repository.
- No authentication or authorization in this slice.
- Store and calculate official monetary values as integer minor units.
- Require optimistic revisions for every mutation.
- Do not integrate Gemma, LangGraph, or Qdrant yet.

## Review Focus

- Cross-trip item IDs must not mutate another trip.
- Locked itinerary items cannot be silently changed or removed.
- Stale revisions must leave all data unchanged.
- Invalid day/time ranges must not reach persistence.
- Quote totals must be calculated server-side with safe-integer overflow checks.

---

### Task 1: Planning domain and in-memory repository

Write failing service tests, then implement draft/item and quote/item contracts, rules, optimistic revision behavior, and an in-memory repository.

### Task 2: HTTP contract

Write failing Supertest cases, then implement Zod schemas, controller and nested trip routes with structured errors.

### Task 3: Prisma persistence

Extend the Prisma schema, generate and apply a migration, implement the Prisma planning repository with transactions, and verify mapping and compilation.

### Task 4: Verification

Run the full suite, typecheck, build, Prisma validation/migration status, npm audit, and a live PostgreSQL smoke test.

