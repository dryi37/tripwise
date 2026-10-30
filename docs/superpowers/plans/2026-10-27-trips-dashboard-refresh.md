# Trips Dashboard Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an advisor-first Trips dashboard with a destination spotlight, clearer trip pipeline, and a more scannable responsive trip queue without changing behavior.

**Architecture:** Keep the buildless rendering model. Update only the Trips-route presentation in `frontend/redesign.js`, add scoped dashboard styling in `frontend/redesign.css`, and extend the existing browser QA rather than introducing dependencies.

**Tech Stack:** Vanilla JavaScript, semantic HTML strings, CSS, existing Node-based QA scripts.

**Spec:** `docs/superpowers/specs/2026-10-27-trips-dashboard-refresh-design.md`

## Global Constraints

- Preserve create, open, search, pipeline/status filter, hash URL, and local persistence behavior.
- Reuse `assets/seoul.jpg`; do not add external runtime assets or network fonts.
- Preserve IDs and data attributes consumed by event delegation.
- Meet WCAG AA contrast, focus visibility, semantic controls, reduced-motion, and narrow-screen requirements.

## Review Focus

- No trips or empty filtered results: show useful recovery content without a broken spotlight.
- Long trip/client names: wrap or truncate without hiding the open action.
- Narrow viewport: spotlight, filters, and rows must stack without horizontal document overflow.
- Keyboard use: search, select, pipeline buttons, create, and open actions retain visible focus and logical order.
- Existing stored data: missing optional fields must not break rendering.

---

### Task 1: Trips dashboard semantic composition

**Files:**
- Modify: `frontend/redesign.js`
- Test: existing Node QA scripts and browser DOM assertions

**Interfaces:**
- Consumes: existing `state.trips`, `route()`, `badge()`, `date()`, `money()`, `search()`, `btn()`, `ico()`, `esc()`.
- Produces: existing `#trip-search`, `#status-filter`, `[data-pipeline]`, `[data-open]`, and `#new-trip` hooks.

- [x] Update `redesignedTrips()` with the approved spotlight, pipeline, and trip-queue hierarchy.
- [x] Preserve behavior hooks and add accessible labels/context where needed.
- [x] Verify empty results and long content render without exceptions.

### Task 2: Scoped visual system and responsive behavior

**Files:**
- Modify: `frontend/redesign.css`

**Interfaces:**
- Consumes: semantic classes emitted by Task 1 and existing root tokens.
- Produces: desktop, tablet, and mobile layouts with no document overflow.

- [x] Add a scoped Trips-dashboard token layer and visual styles derived from the approved design.
- [x] Implement responsive table-to-record behavior at narrow widths.
- [x] Add hover, focus-visible, and reduced-motion-safe states.

### Task 3: Verification and durable context

**Files:**
- Modify: `DESIGN.md`
- Test: project QA scripts, strict UI audit, real-browser desktop/mobile checks

**Interfaces:**
- Consumes: completed Tasks 1–2.
- Produces: evidence that behavior and visual contracts remain intact.

- [x] Record the approved dashboard signature and runtime token ownership in `DESIGN.md`.
- [x] Run existing QA scripts and strict UI audit; fix blocking findings caused by this change.
- [x] Exercise create/open/search/filter/empty states and desktop/mobile layouts in the browser.

