# Custom Quote Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a consultant create a manual service directly from the unified quote table, optionally saving an unverified copy to the supplier catalog.

**Architecture:** Extend the existing app-owned modal and delegated event system in `frontend/redesign.js`. Save the quote row and optional catalog record in one browser-local transaction with rollback on persistence failure; reuse existing quote, supplier-offer, validation, toast and money-formatting conventions.

**Tech Stack:** Vanilla JavaScript, static HTML/CSS, browser-local storage, Node.js QA scripts.

**Spec:** `docs/superpowers/specs/2026-10-27-custom-quote-service-design.md`

## Global Constraints

- New manual quote rows are always `UNVERIFIED`.
- Catalog persistence is opt-in and defaults off.
- Quantity is an integer from 1; VND price is an integer from 0 through 1,000,000,000.
- Required text fields are service name, provider and unit.
- No external API, availability check or automatic verification.

## Review Focus

- Double submission must create only one quote row.
- Failed local persistence must restore both quote and catalog state.
- Catalog opt-in must create one service with one unverified supplier offer.
- Validation must preserve entered values and focus the first invalid field.
- Long provider/service names must remain usable at the narrow layout.

---

### Task 1: Define the manual-service contract

**Files:**
- Modify: `scripts/qa/qa-supplier-offers.cjs`
- Modify: `UX-CONTRACT.md`
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: Unified quote table and existing supplier-aware quotation model.
- Produces: Static assertions and documented invariants for manual quote rows.

- [ ] Add failing assertions for the “Dịch vụ ngoài danh mục” action, modal fields, `UNVERIFIED` snapshot, opt-in catalog checkbox and duplicate-submit guard.
- [ ] Run `node scripts/qa/qa-supplier-offers.cjs`; expect failure on the new assertions.
- [ ] Document the manual-row and optional-catalog behavior in both product contracts.

### Task 2: Implement manual service creation

**Files:**
- Modify: `frontend/redesign.js`
- Modify: `frontend/redesign.css`

**Interfaces:**
- Consumes: `openModal`, `closeModal`, `save`, `render`, `toast`, `uid`, `trip`, `state.rates`.
- Produces: `customQuoteForm()` and `saveCustomQuote(form)`.

- [ ] Add the header action to the unified quote surface and open an app-owned form modal.
- [ ] Validate required text, integer quantity and integer VND price; retain values and focus the first invalid field.
- [ ] Create one quote row with manual source metadata and immutable `UNVERIFIED` snapshot.
- [ ] When opted in, create one rate with one `UNVERIFIED` supplier offer and link the quote snapshot to its exact IDs.
- [ ] Guard the submit action against repeat execution and roll back quote/catalog arrays if `save()` fails.
- [ ] Render the manual line in the unified table and update the total immediately.
- [ ] Add responsive form/action styling and visible focus/disabled states.
- [ ] Run `node scripts/qa/qa-supplier-offers.cjs`; expect all assertions to pass.

### Task 3: Regression and browser verification

**Files:**
- Modify: `scripts/qa/qa-trips-dashboard.cjs` only if shared markup assertions require alignment.

**Interfaces:**
- Consumes: Completed manual-service workflow.
- Produces: Evidence for validation, normal save, catalog opt-in and narrow layout.

- [ ] Run JavaScript syntax checks and every `qa-*.cjs` script; expect exit code 0.
- [ ] Run the strict frontend audit; expect zero findings.
- [ ] In a real browser, verify invalid submission, quote-only creation, total update and duplicate-submit protection.
- [ ] Verify catalog opt-in creates an unverified provider offer linked from the quote row.
- [ ] Verify the form and resulting row at the narrow viewport.
