# Implementation Plan: Remove deployment/configuration literals

## Overview

Audit active backend and static frontend code for deployment-specific and operational values embedded in source. Move configurable settings to required backend environment or frontend runtime configuration, without converting data-format rules, protocol constants, enum values, or arithmetic units into deployment settings.

## Architecture Decisions

- Backend operational settings are required in `backend/.env`; `.env.example` documents local values. The app will not silently fall back to code defaults.
- Browser-only settings live in a separate `frontend/runtime-config.js`, loaded before the API client.
- Environment and runtime configuration are injected into services at composition boundaries.

## Task List

### Phase 1: Backend configuration
- [x] Require backend settings instead of `env.ts` defaults; add model retry/context, Qdrant, rate-limit, JSON-body, and CORS settings.
- [x] Inject model, Qdrant, CORS, body-size, and rate-limit settings; remove remaining agent/model/search operational literals.
- [x] Update local/example env and backend README.

### Checkpoint: Backend
- [ ] Focused environment, model, Qdrant, and API tests pass.

### Phase 2: Frontend runtime settings
- [x] Move API URL and request/agent timeouts to `frontend/runtime-config.js`; remove stale knowledge-search default limit.
- [x] Remove implicit static-server port default; require its port and host as arguments.
- [x] Update targeted frontend QA coverage for runtime configuration and API wiring.

### Checkpoint: Complete
- [ ] Full backend tests pass (API tests require local socket access, blocked in this sandbox).
- [ ] Relevant frontend QA scripts and JS syntax checks pass; unrelated legacy QA assertions remain stale.
- [x] Audit confirms no remaining deployment-specific URLs/timeouts/defaults in active backend/frontend client source.

## Risks

- Environments missing newly required settings will fail startup. `.env.example` and the local `.env` will be updated; other deployment environments must add the listed settings.
- The static frontend needs its runtime config file present at deploy time.
