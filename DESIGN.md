# Tripwise — Consulting workspace
## Intent
Vietnamese travel consultants turn customer requirements into a feasible itinerary and quotation using internal knowledge and external sources. This artifact is a browser-local interaction prototype. AI, online source retrieval and availability checks remain simulated.
## North Star
A consultant should see what is planned, what it costs, where the price comes from and what still needs verification. The itinerary is the primary canvas; AI is a contextual assistant. Preserve IKIGAI identity.
## Reference interpretation
Public product screenshots and official feature pages reviewed on 2026-10-26:
- TravelJoy: contextual itinerary copilot and client proposal preview.
- YourTravelPlanner / Travelandz: reusable product catalog and quotation context.
- Travefy: reusable content and day/event editor.
- Mindtrip: image-rich destination context and legible place cards.
These are interaction references, not copied assets or claims about internal architecture. Reference screenshots remain QA/research only.
## Scope
Refresh shared shell, trip list, itinerary editor, quote provenance, knowledge/rate lists and dialogs. Add a bounded sample source catalog, source detail, explicit quotation addition/update and local client preview. No customer messaging, payments or real booking. Customer requirements, schedule, quote and source snapshots persist locally and travel together in versions. Use shared existing forms, modal and toast.
## Visual tokens
Runtime owner: dist/redesign.css :root overrides maintained dist/styles.css.
- Forest green --green #075342: primary actions and selected days.
- IKIGAI lime --lime #c3df55: selected primary navigation.
- Cool canvas --canvas #f6f8f8; white --surface #fff.
- Text --text #203e38; muted --muted #607772; line --line #dce5e2.
- External-source blue --blue #386b98, distinguished with text and globe icon.
Type: Segoe UI / Arial offline stack. Heading 26–28px semibold, body 14px, controls 12–13px, secondary metadata 10–12px. Display and utility use different scale/weight rather than network fonts. Responsive layout increases key mobile sizes.
## Layout
216px desktop navigation, 68px header. Workspace main canvas plus 304px assistant/requirements/budget rail. Day selection uses finite horizontal scroll; quote table owns its own horizontal scroll. At 850px rail moves below; at 600px navigation becomes bottom bar with all four primary pages. No geographic map is fabricated: real location links open Google Maps.
## Signature
A source-aware plan: internal green and external blue provenance badges connect source cards to quotation lines and saved versions.
## Canonical behavior
UX-CONTRACT.md owns forms, native select/date choices, modal, toast, search and CRUD. Original app.js owns model/validators; redesign.js extends presentation and source operations. Always escape user text; safe external links. Source updates invalidate review and do not duplicate a matching internal rate. A version stores source snapshots, not a mutable source pointer. New rate application removes obsolete provenance.
## Verification
Project script scripts/qa/qa-redesign.cjs exercises source filtering, async sample loading, no-results, duplicate prevention, provenance, cost totals, versions, preview/Escape, budget changes, navigation and 390px viewports. Use screenshots for desktop workspace, source browser, quote, preview, knowledge/rates and mobile. Existing create/edit logic also checked. No framework/typecheck/build installation required for the buildless prototype.
## Limitations
All prices and external results are demonstration data. Native date/select popup locale belongs to the user's browser. Persisted state is browser-local, not shared. No auth or real provider calls. Do not enter real personal data or keys.

## Empty consultation entry
The #intake route and New trip action open a blank brief form. Existing trips without activities open the same intake screen with requirements prefilled. Review requires destination, dates, travelers and a positive budget; request text is not automatically parsed. Explicit confirmation creates/updates the trip. Seoul sample generation remains labeled demonstration; other destinations start manual planning. Before quotation exists, show Unpriced rather than zero or within-budget status. Manual creation unlocks the editor while retaining the unpriced state. Verify with scripts/qa/qa-intake.cjs.

## Simplified advisor rail
Removed customer requirements summary panel and the relax-itinerary shortcut at user request. Intake and editable trip requirements remain available through existing flows. Advisor rail contains assistant and budget only.
## Compact intake visual revision
User requested a redesign of the whole intake screen. One white form card combines brief and a four-column desktop grid. Heading is now Thiết kế chuyến đi with a real two-step indicator. A compact live planning summary replaces generic instructional panels; it reflects form values only, no AI extraction. Desktop sidebar uses the existing forest green and lime palette. Mobile fields use two columns with full-width name/client/destination/budget. Removed introductory copy and AI heading decoration remain absent. Existing review, draft, generation and manual-start logic are reused.
## Practical trips dashboard
Removed the explanatory workflow block at user request. The trips page prioritizes create, search, status filtering and resuming selected work. Status counters are real filter buttons, including ACTIVE as the union of NEW and DRAFT. Filter state remains in hash URL and aligns with the status dropdown. A compact resume row replaces the oversized destination feature. No noninteractive process marketing panels on the working dashboard. QA: scripts/qa/qa-practical-home.cjs.

## Advisor-first trips dashboard
Supersedes the compact resume-row presentation while preserving the Practical trips dashboard behavior. The Trips route uses a hybrid product register: operational density from advisor tools with one restrained destination spotlight. The selected trip is the visual anchor, using the local Seoul image only when destination content matches; all other content remains a quiet working surface. The pipeline stays interactive, the semantic table becomes stacked trip records below 700px, and search/filter/hash behavior remains canonical. Runtime ownership remains `dist/redesign.js` for composition and `dist/redesign.css` for scoped `.trips-dashboard` tokens and styling. The permanent signature is “active trip as working brief,” not a marketing hero or decorative KPI grid. QA: `scripts/qa/qa-trips-dashboard.cjs` plus real-browser desktop/mobile checks.
## Intake refinement — final layout
Supersedes Compact intake visual revision. The final intake groups core trip information first, party/budget second, optional preferences third. One white form with separated sections, 14px input values, no marketing introduction or AI title icon. The summary has a restrained light header rather than a large forest-green block. Summary items are real edit shortcuts that focus matching fields, with reduced-motion-safe scrolling. Form IDs, review, validation, draft preservation, sample generation and manual entry remain unchanged. QA: scripts/qa/qa-intake.cjs and scripts/qa/qa-intake-layout.cjs, plus trips/source regressions.

## Supplier-aware quotations

“Danh mục nhà cung cấp” replaces the misleading one-price service list and remains the administrative owner of services and supplier offers. Service discovery is integrated into “Báo giá” through an inline “Thêm dịch vụ” picker; it is no longer a standalone workspace tab. A service owns category and unit; its nested supplier offers own provider, unit price, validity, terms, verification and preferred state. Every applied quote line references one concrete service/offer pair and keeps a snapshot of it, so later catalog edits never silently change an existing proposal. Legacy browser data is retained as an unverified internal offer. QA: `scripts/qa/qa-supplier-offers.cjs` plus real-browser desktop/mobile checks.

The unified quote also accepts “Dịch vụ ngoài danh mục”. Manual rows require a named provider, unit, integer quantity and integer VND price, and always start unverified. Saving a reusable catalog copy is an explicit opt-in; quote-only is the default. Quote and optional catalog writes behave as one browser-local transaction.
