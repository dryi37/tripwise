# Integrated Quote Sourcing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone “Tìm dịch vụ” tab and let consultants find, compare and add supplier offers directly inside “Báo giá”.

**Architecture:** Reuse the existing source search state and service-card rendering inside the quote workspace rather than maintaining a second route-level tab. Keep supplier catalog administration and quote snapshots unchanged; URL state controls whether the inline picker is open.

**Tech Stack:** Vanilla JavaScript, static HTML/CSS, browser-local state, Node.js QA scripts.

**Spec:** `docs/superpowers/specs/2026-10-27-integrated-quote-sourcing-design.md`

## Global Constraints

- Do not change the supplier data model or quote snapshot mechanism.
- Do not add live web search or a real external API.
- Supplier catalog data remains read-only from the quote picker.
- Quote rows must retain exact `rateId` and `offerId` references.
- UI copy remains Vietnamese and follows the existing Tripwise design system.

## Review Focus

- Opening `#workspace?tab=quote&picker=open` must expose the picker without losing quote edits.
- A service already present in the quote must not be silently duplicated.
- Unverified or expired supplier offers must not be presented as valid confirmed pricing.
- Empty and no-result picker states must still let the user return to the quote table.
- Narrow layouts must keep the picker usable without introducing page-wide horizontal overflow.

---

### Task 1: Pin the navigation and integrated-picker contract

**Files:**
- Modify: `scripts/qa/qa-supplier-offers.cjs`
- Modify: `UX-CONTRACT.md`
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: Existing static source assertions and supplier/quote terminology.
- Produces: QA assertions for the removed tab, the quote picker URL, duplicate protection and exact source references.

- [ ] **Step 1: Add failing static assertions**

Assert that `frontend/redesign.js` has no planning tab with key `sources`, no links to `tab=sources`, uses `tab=quote&picker=open`, renders the inline picker from the quote branch, and preserves `rateId`/`offerId` references.

- [ ] **Step 2: Run the focused QA and verify failure**

Run: `node scripts/qa/qa-supplier-offers.cjs`
Expected: FAIL on the new integrated-picker assertions.

- [ ] **Step 3: Update the product contracts**

Document the canonical flow `Danh mục nhà cung cấp → Báo giá`, the inline “Thêm dịch vụ” picker, read-only catalog data, duplicate behavior and snapshot preservation.

- [ ] **Step 4: Commit the contract slice**

```bash
git add scripts/qa/qa-supplier-offers.cjs UX-CONTRACT.md DESIGN.md
git commit -m "test: define integrated quote sourcing flow"
```

### Task 2: Integrate source discovery into the quote tab

**Files:**
- Modify: `frontend/redesign.js`
- Modify: `frontend/redesign.css`

**Interfaces:**
- Consumes: `sourcesContent(t)`, `serviceCard(s,t)`, `sourceQuery`, `sourceFilter`, `sourceCategory`, quote source/snapshot helpers.
- Produces: `quotePickerContent(t)` markup rendered by the `quote` workspace branch when URL parameter `picker=open` is present.

- [ ] **Step 1: Remove the standalone tab and redirect legacy URLs**

Remove `['sources','Tìm dịch vụ']` from planning tabs. When the requested workspace tab is `sources`, replace the hash with `#workspace?tab=quote&picker=open` so old links remain recoverable.

- [ ] **Step 2: Implement `quotePickerContent(t)`**

Reuse the existing search/filter/result behavior, change the heading to selection-focused copy, add a visible “Đóng” action back to `#workspace?tab=quote`, and expose service cards as quote-add actions without catalog editing controls.

- [ ] **Step 3: Compose the picker with the quote table**

In `workspaceContent(t,'quote')`, keep the current quote overview/table and conditionally append/prepend `quotePickerContent(t)` when `route().p.get('picker') === 'open'`. Change “Tìm thêm dịch vụ” to “Thêm dịch vụ” and point it to `#workspace?tab=quote&picker=open`.

- [ ] **Step 4: Prevent duplicate additions**

For a source whose `rateId`/offer reference already exists in `t.quote`, render an “Đã có trong báo giá” state and do not append a second row. Preserve the current explicit update behavior for a different supplier offer of the same service.

- [ ] **Step 5: Update secondary entry points**

Change advisor, empty-budget and supplier-catalog links from `tab=sources` to `tab=quote&picker=open` with the canonical label “Thêm dịch vụ”.

- [ ] **Step 6: Add picker layout and interaction styles**

Add styles scoped to the quote picker for open/close affordance, result density, duplicate/disabled state, focus visibility, one-column narrow layout and internal overflow ownership.

- [ ] **Step 7: Run focused QA**

Run: `node scripts/qa/qa-supplier-offers.cjs`
Expected: PASS, including removed-tab and integrated-picker assertions.

- [ ] **Step 8: Commit the UI slice**

```bash
git add frontend/redesign.js frontend/redesign.css
git commit -m "feat: integrate service selection into quotes"
```

### Task 3: Regression and real-browser verification

**Files:**
- Modify: `scripts/qa/qa-trips-dashboard.cjs` only if an existing navigation assertion needs the new canonical URL.
- Modify: `artifacts/ui-audit/premium-ui.json` only if verification discovers a stale route expectation.

**Interfaces:**
- Consumes: Completed integrated quote picker.
- Produces: Verification evidence for desktop, narrow viewport, empty/no-results and exact supplier-link navigation.

- [ ] **Step 1: Run syntax and repository QA**

Run: `node --check frontend/app.js`, `node --check frontend/redesign.js`, `node scripts/qa/qa-supplier-offers.cjs`, and `node scripts/qa/qa-trips-dashboard.cjs`.
Expected: Every command exits 0.

- [ ] **Step 2: Run the strict UI audit**

Run the frontend-design-premium strict audit configured for the repository.
Expected: zero blocking findings.

- [ ] **Step 3: Verify the desktop flow in a real browser**

Confirm “Tìm dịch vụ” is absent; open “Báo giá”; select “Thêm dịch vụ”; search/filter; add an eligible offer; verify the picker closes and the new quote row contains the exact provider/source link.

- [ ] **Step 4: Verify failure and edge states**

Exercise no-results, duplicate service, unverified/expired offer and empty-quote states. Confirm each state communicates the reason and retains a clear route back to the quote.

- [ ] **Step 5: Verify a narrow viewport**

Confirm the picker becomes one column, controls remain keyboard-accessible and no page-wide horizontal overflow appears.

- [ ] **Step 6: Re-run QA after fixes**

Repeat Step 1 and the strict audit after any browser-found corrections.

- [ ] **Step 7: Commit verification updates**

```bash
git add scripts/qa/qa-trips-dashboard.cjs artifacts/ui-audit/premium-ui.json
git commit -m "test: verify integrated quote sourcing"
```
