# Agent Tools Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Gemma create grounded itineraries and quote lines through bounded, validated application tools.

**Architecture:** Extend the existing LangGraph loop with narrow tool adapters over CatalogService, KnowledgeService and PlanningService. The model never sees repositories or arbitrary write primitives; every write retains revision and business-rule enforcement.

**Tech Stack:** TypeScript, LangGraph, Google GenAI/Gemma, Zod, existing Express services, Vitest

**Spec:** `docs/superpowers/specs/2026-10-27-backend-fe-sync-design.md`

## Global Constraints

- Keep finite `AGENT_MAX_ITERATIONS` and `AGENT_MAX_TOOL_CALLS`.
- The model cannot invent persisted prices or create verified catalog offers.
- Tool input/output and third-party model output are validated.
- Agent failure does not corrupt partially completed mutations.

## Review Focus

- Repeated identical tool calls do not duplicate quote items.
- Stale revisions produce an explicit recoverable result to the agent.
- Tool-call and iteration limits stop the graph deterministically.
- Unverified/expired offers are described accurately and rejected for automatic quote insertion.
- Prompt injection inside knowledge chunks is treated as content, not executable instruction.

---

### Task 1: Agent tool contracts

**Files:**
- Create: `backend/src/modules/agent/tools/{search-supplier-offers.tool,search-knowledge.tool,add-itinerary-item.tool,add-quote-item-from-offer.tool}.ts`
- Modify: `backend/src/modules/agent/{tour-agent.types,tour-agent.schemas}.ts`
- Test: `backend/tests/tour-agent.tools.test.ts`

**Interfaces:**
- Consumes: catalog, knowledge and planning service interfaces.
- Produces: four discriminated tool definitions with Zod input/output schemas.

- [ ] Write failing tool tests for valid inputs, rejected IDs/limits, source metadata and review-focus offer states.
- [ ] Implement narrow adapters; quote write uses an idempotency key derived from run ID + tool call ID.
- [ ] Run focused tests; expect PASS.
- [ ] Commit tool contracts.

### Task 2: Bounded graph orchestration

**Files:**
- Modify: `backend/src/modules/agent/{tour-agent.service,tour-agent.types}.ts`
- Modify: `backend/src/modules/agent/infrastructure/gemma-agent.model.ts`
- Test: `backend/tests/tour-agent.service.test.ts`

**Interfaces:**
- Consumes: tool registry from Task 1.
- Produces: run result containing message, applied changes, sources and verification warnings.

- [ ] Write failing tests for multi-tool loops, stale revisions, duplicate calls, limit termination, malformed model output and knowledge prompt injection.
- [ ] Update system/tool prompts to distinguish retrieved content from instructions and require sources.
- [ ] Implement orchestration and deterministic counters without unbounded retry.
- [ ] Run focused tests; expect PASS.
- [ ] Commit orchestration.

### Task 3: HTTP and frontend integration

**Files:**
- Modify: `backend/src/modules/agent/{tour-agent.controller,tour-agent.routes}.ts`, `backend/src/server.ts`
- Modify: `dist/{api-client.js,redesign.js,redesign.css}`
- Modify: `backend/tests/tour-agent.api.test.ts`
- Create: `scripts/qa/qa-agent.cjs`

**Interfaces:**
- Produces: existing run endpoint with additive `changes`, `sources`, `warnings`; real FE assistant state.

- [ ] Write failing API/QA tests for configured/unconfigured AI, progress lock, result rendering and safe error recovery.
- [ ] Wire service dependencies and additive response fields.
- [ ] Replace simulated assistant submission with API call and refresh trip/draft/quote from server after changes.
- [ ] Run agent tests and frontend QA; expect PASS.
- [ ] Commit integration.

### Task 4: Full-system verification

**Files:**
- Modify: `backend/README.md`, root design/QA documentation as needed

**Interfaces:**
- Consumes: every previous plan.
- Produces: documented local startup and verified end-to-end flow.

- [ ] Start PostgreSQL and Qdrant; apply migrations and seed deterministic demo data.
- [ ] Run backend tests, typecheck, build and Prisma validation; expect all PASS.
- [ ] Run every frontend QA script; expect all PASS.
- [ ] Browser-smoke create trip → add catalog quote → add manual quote → save/restore version → add/search knowledge → run agent → refresh/cross-tab.
- [ ] Document exact commands, environment requirements and known non-goals.
- [ ] Commit verification/docs.
