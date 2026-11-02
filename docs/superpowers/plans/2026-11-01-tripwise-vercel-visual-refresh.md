# Tripwise Vercel Reference Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the supplied Vercel design analysis as a consistent visual reference across Tripwise while preserving IKIGAI colors and all existing behavior.

**Architecture:** Keep the vanilla HTML/CSS/JavaScript application and its existing route and interaction code. Add a concise, token-led visual refinement layer to `frontend/redesign.css`, using the current brand palette from `frontend/styles.css`; update `DESIGN.md` to document that mapping and the reference boundaries.

**Tech Stack:** HTML, CSS, vanilla JavaScript, existing browser-local application.

**Spec:** `DESIGN.md` — “Vercel reference adaptation — application visual system”.

## Global Constraints

- Use the company logo samples as brand colors: `--green #004832` and `--lime #afc92a`; preserve the existing canvas, text, muted, line, status, and provenance colors.
- Preserve existing status colors, supplier provenance cues, Vietnamese copy, routes, data, validation, search, pagination, and application behavior.
- Keep local system fonts; add no remote fonts, dependencies, or Vercel assets.
- Keep the application dashboard operational and compact; do not convert it to a marketing page or use the Vercel mesh gradient.
- Do not add or run tests unless the user asks for testing or verification.

## Review Focus

- Long Vietnamese labels and trip names: headings and controls remain legible and do not overlap.
- Narrow viewports: shell navigation, intake fields, workspace panels, and catalog cards preserve usable widths.
- Keyboard focus: visible focus indication remains distinct across the green and light surfaces.
- Semantic status tones: warning, error, verified, and external-source indicators retain their existing meanings and colors.
- Reduced motion and overlays: motion stays optional, and modal geometry remains within the viewport.

### Task 1: Establish shared visual tokens and controls

**Files:**
- Modify: `frontend/redesign.css`

**Interfaces:**
- Consumes: existing palette custom properties from `frontend/styles.css`.
- Produces: shared type, spacing, radius, border, and elevation tokens plus consistent styles for shell navigation, headings, buttons, fields, panels, badges, and focus states.

- [x] Add non-color design tokens for the local sans/mono stacks, compact spacing, control/card radii, and subtle elevation; do not override palette tokens.
- [x] Apply the tokens to shared shell and control selectors so app surfaces use the adapted Vercel hierarchy without changing interactions.
- [x] Review the trips list and one modal in the existing browser at desktop and narrow widths for hierarchy, overflow, focus, and modal fit.

### Task 2: Align application surfaces

**Files:**
- Modify: `frontend/redesign.css`

**Interfaces:**
- Consumes: tokens and shared control styles from Task 1.
- Produces: consistent visual treatment for itinerary/intake, quote, checks, versions, knowledge, supplier catalog, settings, and source/detail panels.

- [x] Normalize surface borders, card spacing, section headings, tabs, tables, and metadata across the remaining existing screen classes.
- [x] Keep tables, status badges, source provenance, and interactive states readable and semantically unchanged.
- [x] Review the itinerary and catalog sibling screens against the trips list and inspect a narrow viewport for clipping or layout regressions.

### Task 3: Reconcile design documentation

**Files:**
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: final runtime styles from Tasks 1–2.
- Produces: accurate palette ownership, type/surface guidance, adapted-reference boundaries, and preserved behavior constraints.

- [x] Confirm the documented palette exactly matches the unchanged runtime values and the CSS token mapping.
- [x] Keep the Vercel palette, gradients, marketing shapes, and external assets explicitly out of the application design.
- [x] Inspect the final diff for accidental color-token changes and unrelated behavior edits.

### Task 4: Standardize component dimensions

**Files:**
- Modify: `frontend/redesign.css`
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: the shared spacing/radius/type tokens and the existing responsive component selectors.
- Produces: named compact, standard, touch, and surface-padding dimensions shared across controls, cards, tabs, and tables.

- [x] Define dimension aliases without changing any palette or interaction rules.
- [x] Apply sizes to shared controls and active route components, retaining compact table editing and content-driven layouts.
- [x] Document the component size scale and review desktop layouts in the live app; narrow breakpoint rules were reviewed in CSS.

### Task 5: Align brand colors to the supplied company logo

**Files:**
- Modify: `frontend/styles.css`
- Modify: `frontend/redesign.css`
- Modify: `frontend/app.js` (standalone proposal export)
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: dominant green/lime samples from the user-supplied logo image.
- Produces: logo-aligned primary brand tokens and CSS states that follow those tokens, while preserving canvas/text colors and semantic status/provenance colors.

- [x] Set the runtime brand tokens to sampled logo colors `#004832` and `#afc92a`.
- [x] Replace duplicated hard-coded primary brand roles with the canonical tokens, derive hover styling from the new green, and align exported proposals.
- [x] Update `DESIGN.md`, inspect the diff for unrelated color changes, and view the running app with the updated palette.
