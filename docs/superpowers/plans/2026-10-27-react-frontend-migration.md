# React Frontend Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Tripwise Vanilla frontend with a production-structured React + TypeScript + Vite application with feature parity.

**Architecture:** Build a parallel feature-oriented React app backed exclusively by the existing REST API. TanStack Query manages server state, React Router manages URL state, and shared UI primitives preserve the current Tripwise design language.

**Tech Stack:** React 19, TypeScript, Vite, React Router, TanStack Query, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-27-react-frontend-migration-design.md`

## Global Constraints

- Backend remains authoritative; localStorage contains no business data.
- Default API is `http://localhost:3101/api/v1` and is configurable with `VITE_API_URL`.
- UI language remains Vietnamese and retains the green/lime Tripwise identity.
- No legacy DOM runtime is imported into React.
- WCAG 2.2 AA baseline with semantic controls and accessible feedback.

## Review Focus

- Backend offline or timeout: reads show retry state and writes remain blocked.
- Revision conflict: show a localized conflict message and refresh affected server state.
- Empty trips/catalog/knowledge: usable empty state with the correct primary action.
- Long supplier terms and money values: no hidden critical content or fractional VND.
- Narrow viewport: sidebar/navigation and data tables remain operable.

---

### Task 1: React foundation and typed API

**Files:** Create `frontend/package.json`, Vite/TS configs, `frontend/src/main.tsx`, `frontend/src/app/*`, `frontend/src/shared/api/*`, and API tests.

**Interfaces:** Produce `apiClient.request<T>()`, typed domain contracts, `QueryClientProvider`, router and application shell.

- [ ] Write tests for successful JSON, normalized API errors, timeout/offline errors and revision conflicts.
- [ ] Scaffold Vite React TypeScript and install pinned dependencies.
- [ ] Implement typed API client and providers.
- [ ] Verify tests, typecheck and production build.

### Task 2: Design system and shell

**Files:** Create `frontend/src/styles/*`, `frontend/src/shared/ui/*`, `frontend/src/app/AppShell.tsx` and component tests.

**Interfaces:** Produce reusable Button, Dialog, Field, Badge, Toast and AppShell components.

- [ ] Test accessible names, dialog focus/escape behavior and feedback live region.
- [ ] Translate existing palette, typography, spacing and responsive shell into tokens.
- [ ] Implement sidebar/header/mobile navigation and common async states.
- [ ] Verify keyboard navigation and narrow layout.

### Task 3: Trips feature

**Files:** Create `frontend/src/features/trips/*` with route, queries, forms and tests.

**Interfaces:** Consume trip API and produce trips dashboard plus create/edit flow.

- [ ] Test loading, empty, filtering, create, edit, validation and conflict recovery.
- [ ] Implement list/statistics/search and trip form.
- [ ] Verify refresh reads persisted PostgreSQL data.

### Task 4: Workspace, itinerary, quote and versions

**Files:** Create `frontend/src/features/workspace/*` and interaction tests.

**Interfaces:** Produce tabs for itinerary, quote, checks and versions; mutations invalidate exact trip queries.

- [ ] Test activity CRUD/lock, manual/catalog quote creation, price override, snapshot save and conflict-safe restore.
- [ ] Implement workspace header, tabs, itinerary timeline and source-aware quote table.
- [ ] Implement versions and advisor panel with agent submission.
- [ ] Verify success, error, empty, busy and conflict states in browser.

### Task 5: Supplier catalog and knowledge

**Files:** Create `frontend/src/features/catalog/*`, `frontend/src/features/knowledge/*` and tests.

**Interfaces:** Produce service/offer management, preference selection, knowledge list/create/delete and RAG status copy.

- [ ] Test service/offer creation, validation, preferred eligibility and full terms disclosure.
- [ ] Test knowledge empty/create/failure states.
- [ ] Implement both feature routes using shared dialogs/forms/tables.
- [ ] Verify responsive tables and keyboard use.

### Task 6: Cutover and verification

**Files:** Modify root serving instructions and build output; retire legacy runtime files after parity verification.

**Interfaces:** `npm run dev -- --host 127.0.0.1 --port 8080` and `npm run build` produce the supported frontend.

- [ ] Run formatter, lint, typecheck, unit tests and production build.
- [ ] Run strict premium UI audit and address blocking findings.
- [ ] Exercise all primary workflows in a real browser, including offline and narrow viewport.
- [ ] Confirm production HTML loads React only and document local startup commands.
