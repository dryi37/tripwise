# Supplier Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one sample price per service with grouped, selectable supplier offers whose chosen values are snapshotted into trip quotes.

**Architecture:** Keep the buildless browser-local prototype. `frontend/app.js` remains the data/validation owner; `frontend/redesign.js` owns the upgraded composition; `frontend/redesign.css` owns responsive presentation. Existing state is migrated at load time.

**Tech Stack:** Vanilla JavaScript, semantic HTML, CSS, localStorage, browser QA scripts.

**Spec:** `docs/superpowers/specs/2026-10-27-supplier-offers-design.md`

## Global Constraints

- Preserve the forest/lime Tripwise system and existing modal, form, toast, search, and quote behavior.
- Never silently update an existing trip quote after supplier data changes.
- All prices remain clearly labeled demonstration data.
- Escape all user-controlled text.

## Review Focus

- Legacy localStorage without offers migrates without losing services or trip quotes.
- Selecting one offer clears the previous preferred offer only in the same service.
- Applying an expired or unverified offer is rejected.
- Applying an offer stores provider/validity/source snapshot and retains quantity.
- Narrow layouts remain readable and all actions have accessible labels.

---

### Task 1: Provider-aware data and behavior

**Files:**
- Modify: `frontend/app.js`
- Create: `scripts/qa/qa-supplier-offers.cjs`

**Interfaces:**
- Produces: normalized `state.rates[].offers[]`, preferred-offer selection, and snapshot-based apply behavior.

- [ ] Write QA assertions for migration, preference, invalid offers, and snapshot application.
- [ ] Run `node scripts/qa/qa-supplier-offers.cjs` and confirm failure.
- [ ] Implement normalization, provider-aware forms, selection, and apply behavior.
- [ ] Run the QA script and confirm success.

### Task 2: Grouped supplier-offer interface

**Files:**
- Modify: `frontend/redesign.js`
- Modify: `frontend/redesign.css`
- Modify: `frontend/index.html`
- Modify: `DESIGN.md`
- Modify: `UX-CONTRACT.md`

**Interfaces:**
- Consumes: normalized service/offer model from Task 1.
- Produces: grouped semantic offer table/cards and renamed navigation.

- [ ] Render grouped services, offer state, terms, and preferred controls with escaped content.
- [ ] Add responsive styling using existing tokens and table scroll ownership.
- [ ] Update maintained design and UX contracts.
- [ ] Run existing QA scripts plus `node scripts/qa/qa-supplier-offers.cjs`.
- [ ] Run the premium static audit and browser-check desktop/mobile interaction.
