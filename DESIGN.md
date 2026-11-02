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
Runtime owner: `frontend/styles.css` defines the base palette; `frontend/redesign.css` owns the application-wide refinements and screen-specific layout.
- Forest green `--green #004832`: primary actions, selected itinerary days, and brand navigation.
- IKIGAI lime `--lime #afc92a`: selected primary navigation and restrained emphasis.
- Brand values sampled from the flat fills of the company logo image supplied for this refresh.
- Cool canvas `--canvas #f4f6f2`; white surfaces `#fff`.
- Text `--text #233d33`; muted `--muted #6b7b71`; line `--line #e0e7df`.
- Existing semantic colors communicate statuses and external-source provenance. Do not add, remove, or recolor brand and status tokens as part of visual refinements.
Type uses the offline Segoe UI / Arial stack. Use an editorial hierarchy with compact, readable body copy, tightly tracked headings, and restrained monospace eyebrows for technical context. Controls keep an application-scale hit area and use compact geometry. Responsive layout preserves readable text and usable controls on mobile.

### Type, spacing, shape, and elevation
- `--font-ui`: `"Segoe UI", Arial, sans-serif`; `--font-technical`: `"Cascadia Mono", "SFMono-Regular", Consolas, monospace`.
- Page titles range from 26–32px by screen; section headings use 16–19px; body copy uses 14px; controls use 12–14px. Uppercase eyebrows and table headings use the technical face at 10px.
- Spacing aliases use a 4px base: 4, 8, 12, 16, 24, and 32px.
- Controls use 6px corners, content surfaces use 10px, and overlays use 12px. Status/source badges remain compact squares.
- Cards use a fine border and minimal hairline shadow. Floating overlays retain their existing stronger shadow for separation.
- Runtime mapping: palette variables stay in `frontend/styles.css`; typography, spacing, radii, and elevation aliases live in `frontend/redesign.css` and are consumed by shared shell and screen classes.

### Component dimensions
- Compact actions use a 32px minimum height; standard buttons, fields, and tabs use 40px; primary form actions use 44px. Icon actions are 36px on desktop and at least 44px on touch layouts.
- Badges use a 24px minimum height. Editable quote-table fields may use the compact 32px size on desktop to preserve table density.
- Surface padding has three roles: compact 16px, standard 20px, and featured 24px. Section gaps use 16px and major section gaps use 24px.
- Textareas keep their own comfortable minimum height; dimensions may grow with content. Table rows remain content-driven with consistent 10–12px vertical cell padding.
- At widths below 700px, interactive controls and navigation tabs use a 44px target where their layout permits. Dense editable tables remain horizontally scrollable rather than compressing their columns.
## Layout
216px desktop navigation, 68px header. Workspace main canvas plus compact assistant/requirements/budget rail. The itinerary uses a compact destination cover, a day selector, the activity timeline, then that day's map. Pins represent only activities linked to a selected OSM place; hovering, focusing, or tapping shows the agent's selection reason. Unresolved legacy activities remain in the accessible timeline without invented pins. At 850px the rail moves below; at 600px navigation becomes a bottom bar.
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

## Vercel reference adaptation — application visual system
The supplied Vercel analysis is a reference for typography hierarchy, hairline structure, compact application controls, restrained elevation, and consistent spacing. IKIGAI's current runtime colors above remain fixed. Vercel's black-and-white palette, accent colors, mesh gradients, and marketing button shapes do not transfer to Tripwise.

Apply the visual system across the shared shell, trips dashboard, intake, itinerary, quotation, checks, saved versions, knowledge library, supplier catalog, settings, and dialogs. Keep the operational density and existing responsive layouts. Use the brand green in the primary-action role, lime for existing active emphasis, white surfaces over the cool canvas, and the current line color for fine borders. Keep cards nearly flat, use subtle elevation for overlays, and reserve monospace uppercase labels for small technical eyebrows. The local system font stack remains the runtime font source; no remote font dependency is introduced.

This is a presentation-only refresh. Preserve route behavior, forms, validation, search and pagination state, data contracts, source provenance, pricing and status semantics, and all existing accessibility behavior. Do not change application copy or add Vercel assets. The existing active-trip spotlight remains a concise working brief, not a marketing hero.
## Compact intake visual revision
User requested a redesign of the whole intake screen. One white form card combines brief and a four-column desktop grid. Heading is now Thiết kế chuyến đi with a real two-step indicator. A compact live planning summary replaces generic instructional panels; it reflects form values only, no AI extraction. Desktop sidebar uses the existing forest green and lime palette. Mobile fields use two columns with full-width name/client/destination/budget. Removed introductory copy and AI heading decoration remain absent. Existing review, draft, generation and manual-start logic are reused.
## Practical trips dashboard
Removed the explanatory workflow block at user request. The trips page prioritizes create, search, status filtering and resuming selected work. Status counters are real filter buttons, including ACTIVE as the union of NEW and DRAFT. Filter state remains in hash URL and aligns with the status dropdown. A compact resume row replaces the oversized destination feature. No noninteractive process marketing panels on the working dashboard. QA: scripts/qa/qa-practical-home.cjs.

## Advisor-first trips dashboard
Supersedes the compact resume-row presentation while preserving the Practical trips dashboard behavior. The Trips route uses a hybrid product register: operational density from advisor tools with one restrained destination spotlight. The selected trip is the visual anchor, using the local Seoul image only when destination content matches; all other content remains a quiet working surface. The pipeline stays interactive, the semantic table becomes stacked trip records below 700px, and search/filter/hash behavior remains canonical. Runtime ownership remains `frontend/redesign.js` for composition and `frontend/redesign.css` for scoped `.trips-dashboard` tokens and styling. The permanent signature is “active trip as working brief,” not a marketing hero or decorative KPI grid. QA: `scripts/qa/qa-trips-dashboard.cjs` plus real-browser desktop/mobile checks.
## Intake refinement — final layout
Supersedes Compact intake visual revision. The final intake groups core trip information first, party/budget second, optional preferences third. One white form with separated sections, 14px input values, no marketing introduction or AI title icon. The summary has a restrained light header rather than a large forest-green block. Summary items are real edit shortcuts that focus matching fields, with reduced-motion-safe scrolling. Form IDs, review, validation, draft preservation, sample generation and manual entry remain unchanged. QA: scripts/qa/qa-intake.cjs and scripts/qa/qa-intake-layout.cjs, plus trips/source regressions.

## Supplier-aware quotations

“Danh mục nhà cung cấp” replaces the misleading one-price service list and remains the administrative owner of services and supplier offers. Service discovery is integrated into “Báo giá” through an inline “Thêm dịch vụ” picker; it is no longer a standalone workspace tab. A service owns category and unit; its nested supplier offers own provider, unit price, validity, terms, verification and preferred state. Every applied quote line references one concrete service/offer pair and keeps a snapshot of it, so later catalog edits never silently change an existing proposal. Legacy browser data is retained as an unverified internal offer. QA: `scripts/qa/qa-supplier-offers.cjs` plus real-browser desktop/mobile checks.

The unified quote also accepts “Dịch vụ ngoài danh mục”. Manual rows require a named provider, unit, integer quantity and integer VND price, and always start unverified. Saving a reusable catalog copy is an explicit opt-in; quote-only is the default. Quote and optional catalog writes behave as one browser-local transaction.
