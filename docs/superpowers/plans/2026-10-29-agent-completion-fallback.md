# Agent Completion Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give an itinerary run that tries to finish with empty trip days a focused, bounded fallback loop and report any remaining gaps accurately.

**Architecture:** Add a fallback mode to model input and prompt construction, then coordinate a separate model/tool loop with environment-configured budgets and server-validated unpriced activity batches. Finalize from the persisted draft when complete or when fallback budget/deadline is exhausted.

**Tech Stack:** TypeScript, LangGraph, Gemini function calling, Zod, Prisma-backed planning service.

**Spec:** `docs/superpowers/specs/2026-10-29-agent-completion-fallback-design.md`

## Global Constraints

- Use only `add_itinerary_item` in fallback mode.
- Add only unpriced activities for currently missing trip days.
- Do not search, link prices, or attach sources in fallback mode.
- Preserve configured normal model/tool budgets and the overall deadline; fallback receives one configured day of model/tool allowance, regardless of trip duration.
- If fallback cannot fill every day, state the missing day indices explicitly.
- Automated tests are not authorized in this task; use typecheck/static inspection only.

## Review Focus

- A final response on the last ordinary model turn must still enter the dedicated fallback loop.
- Recovery calls must not exceed the separate day-based model/tool allowances.
- A malformed or unsuccessful fallback batch must produce an incomplete summary, never a success claim.
- Recovery must not bypass normal price/source validation or mutate an already-populated day.
- Non-itinerary chat and already-complete itineraries must not enter fallback mode.

---

### Task 1: Dedicated model fallback mode

**Files:**
- Modify: `backend/src/modules/agent/agent-model.ts`
- Modify: `backend/src/modules/agent/infrastructure/gemma-agent.model.ts`

**Interfaces:**
- `AgentModelInput` gains an optional completion-fallback flag and missing-day indices.
- Gemma selects a compact fallback-only prompt and restricts function calling to `add_itinerary_item`; normal prompt behavior stays unchanged.

- [x] Pass the fallback mode and missing days into the model input.
- [x] Build the dedicated prompt from trip facts, current itinerary, missing day indices, remaining fallback tool allowance, the original request, and bounded chronological model/tool history; omit normal prompt instructions.
- [x] Keep the fallback call limited to the existing configured model timeout/deadline.

### Task 2: Bounded orchestration and truthful completion

**Files:**
- Modify: `backend/src/modules/agent/tour-agent.service.ts`
- Modify: `PROGRESS.md`

**Interfaces:**
- Agent graph state tracks fallback phase, model/tool counters, and separate one-day environment-configured limits.
- Finalization returns a deterministic summary and warning from persisted draft completeness.

- [x] Route a premature final response into the separate fallback loop; preserve normal per-run model budget.
- [x] Give fallback a separate configured tool allowance; validate every fallback call is unpriced and targets a missing day.
- [x] Continue fallback model/tool correction rounds while missing days and budget remain; finalize without another model call after the loop stops.
- [x] Return a success summary only when every trip day has an activity; otherwise name the remaining days and log the incomplete fallback.
- [x] Update progress notes and inspect diffs; run backend typecheck and static inspection only.
