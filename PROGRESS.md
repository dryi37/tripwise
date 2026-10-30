# Tripwise — Progress Handoff

Updated: 2026-10-30 (Asia/Saigon)

## Latest: place itinerary map after the schedule

- Moved the selected day's map beneath its activity timeline and removed the `OPENSTREETMAP` eyebrow from the map heading. Kept required OpenStreetMap attribution visible on the map.
- Verification: `node --check frontend/redesign.js` and `git diff --check`.

## Latest: agent timeout budget per itinerary day

- Set `AGENT_REQUEST_TIMEOUT_MS=600000` (10 minutes) in local and example backend configuration. The agent applies this as a per-trip-day budget, so a 2-day itinerary receives a 20-minute overall deadline; model and tool call quotas are unchanged.
- Restart the backend for the updated `.env` value to take effect.

## Latest: application-wide structured logging

- Added request IDs and structured start/completion/failure logs for every API request, including route template, status, duration, and client disconnects. CORS exposes `X-Request-Id`; frontend API failures log the same ID without request bodies.
- Centralized unexpected/API error logging with safe metadata only. Agent place-search logs now include the searched venue name; provider calls for Photon, Tavily, Frankfurter, Gemini embeddings, and Qdrant record status/count/duration and safe error names. Startup, shutdown, and catalog reindex outcomes are logged.
- `APP_LOG_FILE` is the required JSONL sink setting in both the backend environment and `.env.example`, pointing to `../artifacts/logs/backend/application.jsonl`. No API keys, request bodies, or prompts are recorded.
- Verification: backend build and frontend syntax checks passed; a live GET `/api/v1/health` returned 200 and wrote matching start/completion JSONL entries with `X-Request-Id`; `git diff --check` passed. `npm run typecheck` remains blocked by pre-existing stale tests that still reference the removed Google Places provider and old place schema; no automated tests were run.

## Latest: use one configured Vietnam timezone

- Removed timezone from trip and itinerary creation forms and APIs, including the agent tool arguments. Added required `APP_TIMEZONE` configuration; set the local/example value to `Asia/Ho_Chi_Minh`, and the backend applies it whenever it saves or updates an itinerary activity.
- Removed the trip-level timezone schema change and its unapplied migration. Existing itinerary rows remain as stored; new or edited activities use the configured Vietnam timezone.
- Updated agent/API fixtures and docs. Prisma client generation, backend typecheck, frontend syntax checks, and `git diff --check` passed. Automated tests were not run.

## Latest: dedicated itinerary completion fallback

- When an explicit itinerary request reaches a final response with missing trip days, the agent enters a dedicated fallback model/tool loop with a compact prompt containing the original request, bounded chronological model/tool history, trip facts, the current draft, and missing day indices.
- Fallback has a separate model/tool allowance equal to one configured day, regardless of trip duration. It can only add clearly unpriced activities for missing days; the backend rejects searches, price/source fields, duplicate or already-filled days, and other tool calls. It continues correction rounds until all days are filled, its budget is exhausted, or the overall deadline is reached.
- Final status is computed from the persisted draft. The agent claims completion only when every trip day has an activity; otherwise its summary and warning list remaining day indices. Added `tour_agent.completion_fallback.*` logs for start, rejection, per-activity failure, and final outcome.
- Verification: backend `npm run typecheck` and `git diff --check` passed. Automated tests were not run.

## Latest: send only Tavily content to the agent

- Removed `include_raw_content` from Tavily requests, stopped mapping `raw_content` into web search results, and removed the `rawContent` field from the shared result type. The agent now receives the cleaned `content` excerpt and normalized metadata without the full page extraction.
- Updated existing type-level and provider expectations to match. Verification: backend `npm run typecheck` and `git diff --check` passed; automated tests were not run.

## Agent smoke run: two-day Seoul itinerary

- Created test trip `Kiểm thử fallback 2 ngày Seoul 2026-10-29` (20–21 Nov 2026, two adults, 30,000,000 VND). The first API run reached web search and then failed with `WEB_SEARCH_UNAVAILABLE` after a 10-second tool timeout. The second run completed initial supplier/web searches, then Gemini returned HTTP 429 quota exceeded on model turn 2 after all eight configured retries; the completion fallback was not reached and the trip still has no activities.
- Logs exposed a normal-prompt context-compaction bug: two tool results produced a 135,940-character prompt despite the configured 13,000-character history cap, because one oversized result was never truncated. Updated `compactToolResultsForPrompt` to preserve all history entries while truncating each result fairly within the configured cap.
- Verification after the compaction fix: backend `npm run typecheck` and `git diff --check` passed. A live rerun is pending available Gemini quota; no automated tests were run.

## Latest: allow source-linked web prices from the agent

- The agent may now add a clearly stated public price when it submits the exact URL returned by `search_web`, the listed amount, its currency, and pricing unit. The backend rejects missing links, non-search-result URLs, and currencies that differ from the trip quote currency; it does not allow the model to override internal catalog prices or convert currencies.
- Agent-entered public prices are saved as external quote estimates with `UNVERIFIED` source status and remain linked to the itinerary activity. Per-person prices default to the trip's traveler count when quantity is omitted. If the result has no clear amount, the existing no-price/review flow remains.
- Verification: backend typecheck passed; tests were not run.

## Latest: paginate the services catalog

- Added ten-row pagination to the services table using the trip-list controls, reset the page when searching, and removed the divider beneath the search toolbar.
- Verification: `node --check frontend/redesign.js` and `node --check frontend/app.js` passed. Tests were not run.

## 2026-10-29 split internal and external services
- Added “Nội bộ” and “Bên ngoài” tabs to the services page. The external tab aggregates activities with a saved web URL across trips and joins each activity to its quote row, showing the source link beside the service name without adding a table column.
- Agent-created sourced activities appear after the API refresh; external entries show their trip, destination, price/status, and publisher when available. Search and pagination work within the selected tab.
- Verification: frontend JavaScript syntax checks and `git diff --check` passed; tests were not run.

## 2026-10-29 optional internal service price
- Made the price optional when creating an internal catalog service. A blank price now saves the service without creating a supplier offer, so the table displays “–” and “Chưa có giá” instead of converting the blank input to a zero-price offer.
- The standalone “Thêm giá dịch vụ” form now starts blank and rejects an empty submission; zero remains a valid explicit price. Existing zero-price offers are not altered automatically.
- Verification: frontend JavaScript syntax checks and `git diff --check` passed; tests were not run.
## Latest: round the services table border

- Added an inset border and 10px corner radius to the services table, matching the trips table while preserving the existing inset and mobile horizontal scroll.
- Validation: inspected the resulting table CSS. Tests were not run.
## Latest: balance trip list columns

- Set desktop table layout to fixed column proportions so the trip title no longer consumes excess width; mobile cards retain their full-width layout.
- Validation: inspected the responsive CSS rules. Tests were not run.
## Latest: simplify trip list columns

- Removed the trailing arrow action, separated trip and customer into dedicated columns, and placed guest group before departure date.
- Verification: `node --check frontend/redesign.js` passed. Tests were not run.
## Latest: compact knowledge intro panel

- Reduced the knowledge intro panel padding, icon block, heading, and supporting text to match the compact service guidance panel; kept the same compact sizing on mobile.
- Validation: reviewed the desktop and mobile CSS rules. Tests were not run.

## Latest: remove page subtitles across workspace tabs

- Removed the explanatory line directly beneath the page title on Trips, Knowledge, Services, and Settings. Trip-specific workspace context and explanatory content inside cards remain intact.
- Verification: `node --check frontend/redesign.js` passed. Tests were not run.
## Latest trips dashboard layout adjustment

- Moved trip search and status filter into the “Chuyến đi của bạn” heading row, aligned to the right on wide screens and stacked responsively on narrow screens.
- Removed the explanatory line under the heading.
- Verification: `node --check frontend/redesign.js` passed. Browser layout showed search/filter alongside the heading; trip data did not load after refresh because the local API was unreachable. Tests were not run.

## Latest knowledge library card cleanup

- Removed document status badges, the source/group line, and the “Read document” button from knowledge cards. Document titles are keyboard-accessible buttons that open the full document detail.
- Added a 600-character preview to the knowledge list response; cards show its first three lines with an ellipsis. Removed the source/group field from the add-document form and from the detail view.
- Verification: backend `npm run typecheck` and frontend `node --check` passed. Browser rendering could not be verified because the local API at `localhost:3101` was unreachable from this environment; the page showed a fetch failure. Tests were not run.

## Latest UI audit: remove implementation details from consultant screens

- Removed database/vector-search explanations and the “RAG đã kết nối” badge from the knowledge page. Replaced raw indexing statuses with consultant-facing states: “Sẵn sàng tra cứu”, “Đang xử lý”, and “Cần xử lý”.
- Replaced the settings page's PostgreSQL/API/backend inventory with a focused data-backup action and removed the product-preview footer label.
- Reworded visible offline/save/error messages so they explain what the consultant can do without exposing backend terminology. Kept workflow and source-verification statuses that help consultants act.
- Verification: `node --check` passed for the four active frontend scripts; searched active UI files and the named infrastructure copy is gone. Tests were not run.

## Latest UI cleanup: remove development and sync labels

- Removed “Môi trường phát triển” and “Dữ liệu được đồng bộ với máy chủ” from the sidebar.
- Removed sync/server status badges and labels from the trips dashboard and top bar while keeping trip workflow statuses such as “Đang soạn”.
- The active static frontend is served from `frontend/`; matching `frontend/index.html`, `frontend/redesign.js`, and `frontend/api-sync.js` were updated.
- Verification: JavaScript syntax checks passed; searched the active frontend files and no removed status labels remain. Tests were not run.

## Latest: connect persisted public sources to quote and itinerary UI

- Added the trip-scoped external-source list API to the frontend client and load saved public search results with each trip.
- Replaced the dead “Bên ngoài” quote filter data path with persisted external-source records. External quote rows show publisher, price, confidence, retrieval date, and a source detail panel with a direct link to the page.
- Correctly map external quote rows as `EXTERNAL`/web sources and attach canonical source links to linked quote rows and itinerary activities.
- Verification: `node --check` passed for `api-client.js`, `api-sync.js`, and `redesign.js`. Tests were not run.

## Latest follow-up: remove supplier entity and add service actions

- Removed the supplier entity from Prisma and the supplier API, removed `supplier_id` from catalog offers and `supplier_name_snapshot` from quote items, and applied migration `20261029090000_remove_supplier_entity` to the local development PostgreSQL database. Existing services, prices, quote lines, itinerary links, and stable offer IDs remain; service deletion is a soft delete (`is_active = false`) so historical plans are preserved.
- Removed supplier fields from manual quote inputs, catalog offer creation/search records, Prisma repository mappings, embeddings, and agent context. Public web publisher names remain as citations for external sources.
- Removed supplier input from the add-service and edit-price forms, and updated internal source labels so the frontend no longer reads the deleted `offer.provider` property.
- Added a named “THAO TÁC” catalog column with edit and delete actions for each offer/service row. Delete asks for confirmation and deactivates the service while retaining historical records.
- Updated backend test fixtures/contracts to remove the supplier model and API assumptions; removed the obsolete supplier API test.
- Verification: `npm run typecheck`, `npm run build`, `node --check frontend/redesign.js`, `node --check frontend/api-sync.js`, and `npx prisma migrate deploy` passed. The migration applied successfully to the dev database. The full test suite was not run.

## Latest follow-up: activity-style service names

- Updated catalog titles to read like itinerary activities (for example, “Dùng bữa tại Seoul”, “Nghỉ tại Seoul Garden Hotel”, and “Di chuyển bằng xe riêng 11 chỗ tại Seoul”). Unknown details remain explicitly marked as unknown.
- Removed the duplicate unit shown beneath each service title. Units remain next to prices in the price column.
- Verification: `node scripts/qa/qa-supplier-offers.cjs` and `node --check frontend/redesign.js` passed. Dev API confirmed all 11 names; prices and `UNVERIFIED` states were unchanged.

## Latest: clearer service names and compact catalog rows

- Replaced generic legacy service labels such as “giá nội bộ cũ” with service names that describe what is being priced. Where the source data is incomplete (for example, hotel, itinerary, or flight route), the name says what remains unknown instead of implying a verified detail. Removed supplier names embedded in service titles where they were only source attribution.
- Kept prices, verification statuses, details, offer IDs, and supplier relations unchanged. Supplier attribution remains available in persisted offer/source data for quote source links and agent use.
- Removed the supplier column from the service catalog UI and removed supplier names from catalog search. Updated the guidance and search copy to focus on services and supplemental details.
- Supplemental details now clamp to three lines with an ellipsis; the full text remains available as the cell title on hover. Adjusted table widths for the new column layout.
- Verification: `node scripts/qa/qa-supplier-offers.cjs` passed; `node --check frontend/redesign.js` passed. The development catalog API returned all 11 rows after updates; prices and `UNVERIFIED` statuses remained unchanged, and every offer retained its supplier link.

## Latest correction: supplier catalog is a flat service-and-offer table

- Replaced service-group cards with a flat table where each row shows service and unit, price, verification status, supplemental supplier details, supplier, then service-type tags as the final data column. The supplier and supplemental information are near the end of the row.
- Removed the redundant “Sửa dịch vụ” link from under the service name and removed the trailing plus-icon action. The service name opens its edit action, and “Thêm nhà cung cấp” is kept as a text action in the supplier cell so additional offers can still be added without the confusing far-right plus button.
- Removed the validity column and validity input from the catalog UI. Existing validity fields remain in storage for compatibility and agent checks; edits no longer require entering a date.
- Replaced suitability tags (family, culture, accessibility, indoor/outdoor) with service-type tags: `FOOD`, `LODGING`, `TRANSPORT`, `SIGHTSEEING`, and `OTHER`. The UI presents them as multi-select checkboxes and writes the first selected type to the legacy category field for compatibility.
- Added migration `20261028060000_service_type_tags` to convert empty or legacy suitability tags to the service's type based on its category. Both service-tag migrations are applied in the dev database; Prisma reports all 15 migrations up to date and all 6 services are tagged.
- Fixed agent catalog category filtering to match secondary service-type tags as well as the legacy primary category, and included tags in the compact Gemini catalog context. Added regression tests for tag validation, localized secondary-category filtering, and agent context.
- Replaced unconditional startup re-embedding with incremental synchronization. Each Qdrant catalog point stores a SHA-256 hash of the exact text used to create its embedding. Startup reads payload hashes and embeds/upserts only new or changed active `VERIFIED` offers; unchanged offers reuse their persistent vectors. Existing legacy points without a hash are refreshed once only if their offer is active and verified. Normal offer/service changes continue to update or remove only affected vectors.
- Startup removes Qdrant points for DB-known inactive/unverified offers, without embedding them. Agent search independently checks current DB status as a second guard, so only active `VERIFIED` offers can be selected. Explicit offer/service changes continue to update or remove only their affected vectors.
- Verified local dev state before cleanup: Qdrant collection `tripwise_catalog_offers` contained 11 points matching the 11 DB offers, all `UNVERIFIED` and with no content hashes. Startup removed those 11 ineligible vectors without calling Gemini; the collection now has 0 points. When an offer becomes verified, its normal update flow writes the eligible vector.
- Verification: full backend suite 24 files / 124 tests passed; backend typecheck and build passed; all seven frontend QA scripts passed (including 20 API-sync assertions and 23 trip-dashboard assertions); both modified frontend scripts pass `node --check`. Live checks after cleanup: frontend HTTP 200, API health `ok`, catalog API returns 6 services and all have tags; PostgreSQL and Qdrant containers are healthy. Backend startup logged `catalog.embedding_index.startup_complete`.

## Latest: consultant-entered activity pricing and cleaner quote/catalog UI

- The add-activity flow now accepts quantity, unit, and optional unit price. A selected internal offer or external source stays linked; when the consultant changes its price, the quote stores the entered amount and keeps the source price snapshot. A manually priced activity also creates a linked quote row. With no price, the quote row remains unpriced and displays `–` in the UI.
- The quote table no longer displays a supplier column. Source details remain accessible through `Xem nguồn dịch vụ`, which opens the linked internal offer or external-source details.
- Service catalog forms now use a fixed category selector plus multi-select service tags. Tags are persisted and included in the text used to build catalog embeddings. Supplier entry is positioned after offer price, validity, status, and details.
- Added Prisma migration `20261028050000_service_tags` for `services.tags`. Migration deployment could not run because the local PostgreSQL service is not listening at the configured dev port; apply migrations after starting the dev database.
- Verification: focused planning/catalog/embedding tests 25/25 passed; backend typecheck and build passed; frontend QA (`qa-quote-inputs`, `qa-api-sync` 20 assertions, `qa-supplier-offers`) passed; modified frontend scripts passed `node --check`. Full Vitest ran 119 tests: 83 passed, while 36 API tests could not bind loopback sockets (`EACCES` in this sandbox). Runtime browser verification and DB migration remain pending until local services are available.

## Latest: remove demo catalog rows and seed useful internal knowledge

- Removed the three `[DEMO - CHỈ DÙNG KIỂM THỬ]` services/offers, their unused supplier, and the matching demo knowledge document from the dev database and Qdrant. Historical quote rows were retained; their catalog links were cleared by the existing foreign-key behavior.
- Replaced the old seed that generated fake supplier prices with `npm run seed:agent-knowledge`. It idempotently indexes three internal Seoul guides covering area-based itinerary ideas, season/weather checks, and matching activities to quote prices. Added `npm run cleanup:demo-catalog` for targeted removal of the old tagged test data.
- Live verification: catalog API returns 6 services and no demo-tagged rows; knowledge API returns 3 `INDEXED` documents; semantic search for Gyeongbokgung/Bukchon returns the area guide first. The Knowledge UI shows all three documents and reports RAG connected.
- Verification: 23 backend test files / 110 tests passed; typecheck and build passed.

## 0.8. Keep agent itinerary prices linked and separate quote discovery

- Itinerary requests now always search internal verified supplier offers, even when the consultant did not separately ask for pricing. The agent prompt requires matching sourced offers to be linked into the quote, uses the existing one-action public-source flow for suitable web estimates, and clearly calls out activities without a reliable price.
- Agent itinerary tools accept only a `supplierOfferId` from internal search for linked prices. The backend checks that the offer is active, verified, currency-matched, and valid on the trip start date before writing the activity. It saves the supplier offer id on the itinerary activity and adds the quote line using the same source id; activity and quote can now be correlated after reload. Existing external activities and quote rows continue to share `externalSourceId`.
- Added Prisma migration `20261028040000_itinerary_offer_links` to persist the internal supplier link on itinerary items. Applied successfully to local PostgreSQL; schema validates.
- Quote UI now renders selected quote lines in their own section and the available service search list below it. The lower list retains source/category filters and search, shows ten entries per page, and provides previous/next pagination. Existing page layout and navigation remain unchanged.
- Verification: all 21 backend test files / 99 tests passed; backend typecheck and build passed; Prisma schema valid and local database up to date; frontend static QA passed (`qa-supplier-offers`, `qa-api-sync`, style restoration, icons, and quote inputs); `node --check frontend/redesign.js` passed.

## 0.10. Link itinerary activities and quote rows

- Adding an activity from the itinerary now writes a corresponding quote row. The form lets the consultant select a verified, date-valid internal supplier offer or a suitable saved public source; the backend loads the selected price and source details itself.
- If no price is selected, the backend creates a linked `NEEDS_REVIEW` quote line. Its API price and amount are null, the quote UI shows `–`, and the row contributes zero to the total. The quantity remains editable; entering a price converts the row to a manually priced item.
- Removing an activity continues to remove its linked quote row. Activity additions through the agent keep their existing source-specific tools and linking behavior.
- The quote tab now only shows the trip’s selected quote lines and total; service search, pagination, and “add service” actions were removed from that tab. Catalog and web-source choices happen while adding an activity.
- Verification: focused planning service tests passed (13/13); frontend static QA passed for API sync, quote inputs, supplier catalog, development mode, trips dashboard, icons, and style restoration; backend typecheck/build and Prisma validation passed. Full suite: 73 tests passed, while 35 HTTP API tests could not bind loopback sockets (`EACCES`) in this sandbox.

## 0. Latest completion: agent web search and external estimates

The bounded web-search flow is implemented without changing the approved page structure:

- Added provider-neutral `WebSearchService` and a bounded Tavily HTTP adapter with configurable timeout and a maximum of five results.
- Candidates normalize price/currency, canonical citation, publisher/domain, retrieval time, audience/unit, hours/closure/season/weather evidence when supplied, date suitability, staleness, conflicts, and confidence. Malformed prices and unsafe URLs are discarded.
- Added persisted `ExternalSource` records with canonical-URL deduplication per trip. Migration `20261027234000_external_sources` was applied successfully to local PostgreSQL.
- Added agent tools `search_web` and `add_place_from_external_source`. Selection only accepts a server-issued UUID and loads price/citation from persistence.
- A suitable selection links the itinerary activity and an `EXTERNAL` quote item. Repeated selection does not duplicate rows. Unsuitable sources and foreign-currency prices without explicit conversion are rejected.
- External quote lines keep the price/citation snapshot, remain `UNVERIFIED`, and display `Nguồn bên ngoài · Giá web ước tính · Chưa xác minh` in the existing UI.
- `GET /api/v1/trips/:tripId/external-sources` powers the existing `Bên ngoài` filter. Source detail shows citation, retrieval time, confidence, and constraints; itinerary activities link to it.
- The browser agent timeout is now bounded at 120 seconds; other requests retain the 10-second default.

New configuration is documented in `backend/.env.example`. A missing Tavily key fails safely with `WEB_SEARCH_NOT_CONFIGURED`.

Fresh verification:

```text
Test Files  20 passed (20)
Tests       82 passed (82)
Typecheck   passed
Build       passed
Prisma      schema valid; migration applied
Frontend QA 4/4 passed
```

Operational limitation: public results are evidence, not booking confirmation. Weather beyond a reliable forecast horizon is treated as seasonal/weather risk rather than a guarantee. Cross-currency web prices are blocked until a dated exchange-rate source and conversion snapshot are implemented.

## 0.1. Web result normalization hardening

Updated 2026-10-28 after reviewing a real agent result that copied a long Da Nang ticket-price list into an itinerary activity. Search now rejects destination-wide/listicle titles and any snippet with multiple distinct prices, extracts only a short citation excerpt around a single unambiguous price, normalizes the venue title, and applies a conservative source-confidence score. New external sources are selectable only when opening hours were found and an open day falls within the trip. The planning mutation checks the selected visit date and time against the stored opening hours and known closures. Activity descriptions are composed from normalized place metadata rather than raw web excerpts. Adult/child price snippets derive their quote quantities from the trip party; nationality-specific prices are blocked when traveler nationality is unavailable. Unknown seasonal and weather conditions are surfaced as uncertainty.

Existing external sources and activities are preserved; previously stored noisy records are not rewritten automatically. Re-search the place to create a clean source after restarting the backend.

## 0.4. Internal tool priority and bounded search behavior

- Updated the agent prompt to require `search_knowledge` on the first model turn, then `search_supplier_offers` before web search for requests involving prices or bookable services. This makes the internal search path explicit; its current usefulness depends on having knowledge documents and verified supplier offers populated.
- Added a server-side maximum of three web searches per agent run. Any additional model request receives a `limitReached` tool result without another provider call, and the model is directed to stop searching and proceed with unpriced draft activities when reliable evidence is unavailable.
- Added prompt and orchestration tests for internal-first workflow, no-source fallback, and the enforced web-search budget.
- Verification: 21 test files / 93 tests passed; typecheck passed; build passed; Prisma schema valid.
- Live inventory check from the prior debug run found zero knowledge documents and zero verified catalog services. Populate those stores to see substantive internal results in the agent response.

## 0.5. Internal demo data for agent testing

- Added `npm run seed:demo-agent`, an idempotent local seed that creates three Seoul supplier offers and indexes a sample family-itinerary note in PostgreSQL/Qdrant. All records carry an explicit `[DEMO - CHỈ DÙNG KIỂM THỬ]` label; offers use `VERIFIED` only to exercise the agent's internal quote flow and must never be used as customer prices.
- The agent prompt now requires prices/terms from any `DEMO` result to be disclosed as simulated test data, never real availability or a booking. Seed usage and caveat are documented in `backend/README.md`.
- Seed completed successfully against the running local PostgreSQL, Gemini Embedding and Qdrant. API verification found 3 matching demo offers and 1 indexed knowledge result (similarity score 0.744).
- Verification after the seed addition: 21 test files / 94 tests passed; typecheck passed; build passed; Prisma schema valid.

## 0.6. Correlate Gemini input and retry logs

- Model start/completion/failure, prompt preparation, retry, and provider-failure events include `runId` and `turn`. Each retry retains those values and increments `attempt`; standalone model invocations receive a `standalone-<uuid>` run ID.
- No separate model-call identifier is used; `runId + turn` correlates one model request and all its retry events.
- Verification after simplifying log correlation: 21 test files / 95 tests passed; typecheck passed; build passed; Prisma schema valid.

## 0.7. Live one-day agent test and orchestration fixes

- A live test found LangGraph's default recursion limit stopped configured 20-turn runs at turn 13. The graph now sets its recursion limit from `AGENT_MAX_ITERATIONS` so the configured bound is authoritative.
- Internal verified offers were returned by the catalog but omitted from Gemini's prompt because result compaction expected `{data: [...]}` while the tool supplied an array. Compaction now preserves array results and offer IDs/prices. If a natural-language offer query has no exact match, the agent retries the catalog search by trip destination and records `tour_agent.catalog.destination_fallback` with only the result count.
- The prompt now says an explicit request to create a tour/itinerary is incomplete until at least one activity is added per trip day. It also tells the model not to repeat an empty supplier search.
- Live API run `be5ac135-a8e2-4100-9fa6-a66b902bdbf9` completed for a one-day Seoul test trip: one internal knowledge result, three itinerary activities, 4 tool calls total, 2 model turns, and HTTP 200. This final run did not request a quote; internal offer retrieval was separately observed returning the 3 demo offers after destination fallback.
- Latest verification: 21 test files / 98 tests passed; typecheck passed; build passed; Prisma schema valid.


## 0.2. Agent diagnostics and longer request timeout

- Added correlated JSON logs for each agent run, model turn, tool execution, and provider failure. Every event includes a `runId`; events capture durations, counts, tool names, and sanitized error codes/status only. Prompts, raw search queries, provider messages, credentials, and request bodies are not logged.
- Increased the Gemini per-call timeout from 90 to 120 seconds. Added a configurable overall agent deadline using `AGENT_REQUEST_TIMEOUT_MS` (default 300,000 ms; allowed range 30,000–600,000 ms), enforced across multiple model/tool turns. The browser waits 330 seconds for this endpoint.
- Agent timeout failures use `AGENT_TIMEOUT` and a Vietnamese UI message.
- Verification in this environment: targeted agent/web-search/planning tests passed (32/32); backend typecheck and build passed. The complete Vitest suite was attempted; 35 API tests could not bind localhost sockets (`EACCES`) in the sandbox. Earlier focused failures exposed stale test fixtures, which were updated to include normalized price/opening-hours evidence and expected party-size quote quantities.
- Live end-to-end agent execution was not re-run in this environment: no backend process was listening on port 3101, and local API/browser QA scripts require localhost access blocked by the sandbox. Restart backend with the updated environment and inspect JSON lines by `runId` when submitting from the chat composer.
## 0.3. Auto-generate itinerary when confirming trip creation

- The intake confirmation action now creates/updates the trip, then calls the real agent with the customer's request. If the request is empty, it builds a prompt from destination, dates, party size, and asks the agent to verify public place/hour/season/weather/price evidence. The manual-design action still only saves the trip.
- The confirmation now offers agent itinerary generation for every destination, not only the Seoul sample path. Existing page structure is unchanged.
- The frontend shows a progress toast and success/failure feedback. If agent generation fails after trip creation, the saved trip remains available and the error explicitly says the trip was saved but the itinerary was not generated.
- A single UUID is sent as `X-Client-Run-Id` for the trip write and agent request. Backend logs `http.trip.create.*`, `http.agent.request.*`, and correlated `tour_agent.*` events with the trip ID, duration, status, tool/turn counts, and sanitized error codes. Request bodies and prompts are not logged. CORS permits the correlation header.
- Verification: backend tests 20 files / 85 tests passed; typecheck and build passed; frontend QA scripts (`qa-api-sync`, style restoration, icons, quote inputs, trips dashboard) passed; modified browser scripts pass `node --check`.
## 1. Current state

Tripwise currently runs as a static JavaScript frontend backed by an Express/TypeScript API. The attempted React/Vite migration was removed because it did not preserve the approved UI. The live frontend is served from `frontend/`; `frontend-original/` is reference material only.

- Frontend: `http://127.0.0.1:8080/`
- API: `http://127.0.0.1:3101/api/v1`
- PostgreSQL: `127.0.0.1:55432`
- Qdrant: `http://127.0.0.1:6333`
- Backend architecture: Route → Middleware → Controller → Service → Repository
- Database access: Prisma + PostgreSQL
- Agent orchestration: LangGraph
- LLM: Gemini API using `gemma-4-26b-a4b-it`
- Embeddings: `gemini-embedding-001`

Do not commit or print `backend/.env`. It contains the local Gemini API key. Use `backend/.env.example` as the configuration reference.

## 2. Start the project

Docker Desktop must be running.

```powershell
cd D:\intern\tripwise\backend
docker compose up -d
npm install
npm run prisma:generate
npm run dev
```

In another terminal:

```powershell
cd D:\intern\tripwise
node scripts/serve-static.cjs frontend 8080 127.0.0.1
```

Use the current legacy hash routes:

- Trips: `http://127.0.0.1:8080/#trips`
- Workspace: `http://127.0.0.1:8080/#workspace?tab=itinerary`
- Quote: `http://127.0.0.1:8080/#workspace?tab=quote`
- Knowledge: `http://127.0.0.1:8080/#knowledge`
- Supplier catalog: `http://127.0.0.1:8080/#rates`

Important: routes such as `#/workspace/{tripId}` belong to the removed React version. On a clean load they resolve to “Không tìm thấy trang”. The current frontend stores the selected trip in application state and uses `#workspace` without a path parameter.

## 3. Frontend/backend synchronization

`frontend/index.html` must load scripts in this order:

1. `api-client.js`
2. `app.js`
3. `redesign.js`
4. `api-sync.js`

The missing `api-client.js` and `api-sync.js` references were fixed. Without them the UI silently uses browser demo data and cannot resolve PostgreSQL trip IDs.

Relevant files:

- `frontend/index.html`: static entry point
- `frontend/app.js`: original state and rendering runtime
- `frontend/redesign.js`: approved visual redesign and workspace screens
- `frontend/api-client.js`: REST client for the backend
- `frontend/api-sync.js`: maps server data into the legacy frontend and redirects writes to the API
- `scripts/serve-static.cjs`: no-cache local static server

The frontend currently uses a read-only browser cache only as an offline fallback. PostgreSQL is authoritative while the API is reachable.

## 4. Backend modules

Backend source is under `backend/src/modules/` and is organized by feature. Each module follows the requested layering where applicable:

- `trips`: trip CRUD and optimistic revision checks
- `planning`: itinerary draft and quote mutations
- `catalog`: suppliers, services, and supplier offers
- `versions`: save and restore plan snapshots
- `knowledge`: PostgreSQL documents, Gemini embeddings, and Qdrant retrieval
- `agent`: LangGraph loop, Gemma model adapter, rate limiting, and tools

Shared HTTP validation and errors are under `backend/src/shared/`.

## 5. Agent tools currently available

The agent currently has four allowed tools:

1. `search_knowledge`
   - Searches internal documents through Qdrant.
2. `search_supplier_offers`
   - Searches verified supplier offers from PostgreSQL.
3. `add_itinerary_item`
   - Adds an activity to the editable itinerary draft.
4. `add_quote_item_from_offer`
   - Adds a quote line only from an exact verified supplier offer ID.

The model never receives direct database access. Quote prices must come from verified supplier offers; it must not invent or copy an arbitrary web price into the quote.

## 6. Agent fixes completed

`backend/src/modules/agent/infrastructure/gemma-agent.model.ts` now includes:

- A bounded Gemini request timeout of 90 seconds (`GEMMA_REQUEST_TIMEOUT_MS`).
- A prompt rule that prevents repeating a knowledge search that already returned no results.
- Permission to use general model knowledge only for unpriced itinerary activities after an empty internal search.
- A prompt rule to emit multiple `add_itinerary_item` calls in one model turn when several activities are required.
- A safe final-summary fallback when tools were successfully applied but Gemma returns an empty final response.
- Sanitized provider-error logging with error name, message, and status only; never log the API key.

Regression tests are in `backend/tests/gemma-agent.model.test.ts`.

## 7. Real agent test performed

Test trip:

- ID: `d35b70eb-62cb-48c5-a5e0-a84764a8fd6f`
- Title: `Tokyo first-write`
- Customer: `Test`
- Dates: 2027-05-01 through 2027-05-03
- Travelers: 2 adults

A restore point was saved before the real agent test:

- Version ID: `eebff873-bcfc-4570-9bea-a1f9eccbf69b`
- Name: `Trước khi kiểm thử agent tạo lịch trình`

The agent created a complete six-activity itinerary in PostgreSQL:

- Day 1: Asakusa; Tokyo Skytree
- Day 2: Đền Meiji Jingu; Giao lộ Shibuya
- Day 3: Chợ ngoài Tsukiji; teamLab Planets

The itinerary draft revision is `8`. A final no-write agent verification returned successfully in one model turn, executed zero tools, kept revision `8`, and confirmed two activities per day.

The quote was not changed by this test:

- Quote revision: `5`
- One manual Hotel line: quantity `2` × `3,000,000 VND`
- Total: `6,000,000 VND`

This Tokyo record is technical test data, not the approved Seoul sample tour.

## 8. RAG status

The end-to-end RAG pipeline has been tested successfully:

`PostgreSQL document → Gemini embedding → Qdrant indexing → semantic search`

A temporary uniquely identifiable document was created, indexed, found by search, and deleted. After cleanup, the Qdrant collection was healthy and had zero test points.

Known limitation: existing knowledge documents created before Qdrant integration are not automatically backfilled. They must be re-indexed before the agent can retrieve them. At the last check, the knowledge API returned zero documents.

## 9. Important missing feature: web search for places and public prices

The agent does **not** currently have web access. The Tokyo itinerary was generated from model knowledge after the internal knowledge search returned empty. It is therefore not verified for current opening hours, closures, ticket prices, travel times, or availability.

The intended product behavior is broader than place discovery: the agent must search the web for suitable attractions/services **and their public prices**, create a persisted **external source** (`Nguồn bên ngoài`) from the selected result, add the chosen place to the itinerary, and add the corresponding estimated cost to the trip quote. The itinerary activity and quote line must reference that external source. Web prices are allowed in the trip as estimates, but they must remain distinguishable from verified supplier offers.

Recommended next implementation:

1. Add a bounded `search_web` or `search_places` agent tool.
2. Prefer Google Places for canonical place details, address, opening hours, and ratings.
3. Use Tavily, Serper, or official-site lookup to find published ticket prices and pricing conditions.
4. Return structured place and price evidence: place/service name, amount, currency, pricing unit (person/ticket/group/etc.), audience (adult/child), title, URL, publisher/domain, retrieval time, validity text, and relevant excerpt.
5. For the trip's actual dates, also collect and evaluate seasonality, expected weather constraints, opening hours, weekly/holiday closures, maintenance closures, public holidays/festivals, peak periods, advance-booking requirements, capacity/availability signals, recommended visit duration, coordinates, travel-time implications, and suitability for children, older travelers, or limited mobility.
6. Prefer official attraction/operator and authoritative tourism/weather sources. When sources conflict, retain the conflict and lower confidence instead of silently choosing a value.
7. Treat all web content as untrusted reference data; never execute instructions found in retrieved pages.
8. Deduplicate searches and cap result count/tool calls.
9. Add a persisted external-source model instead of storing loose URLs directly on quote lines. Suggested fields: `id`, source result key, place/service name, publisher/domain, canonical URL, retrieved-at time, excerpt/evidence, original amount/currency, pricing unit, audience, validity text, season/opening constraints, location data, confidence, and verification status.
10. Add an explicit tool such as `add_quote_item_from_external_source` that accepts only an external-source/result ID previously issued by the bounded search tool. Do not allow the model to pass an arbitrary amount or URL.
11. Extend the quote source enum with `EXTERNAL` and add `externalSourceId`. Preserve the price snapshot, original currency/amount, conversion metadata when applicable, and verification status on the quote line.
12. When the agent selects a web-priced place, it should persist/reuse the external source, link the itinerary activity to it, and add its estimated quote line in one controlled workflow. Prevent duplicates and keep optimistic revision checks.
13. Before adding a place, reject candidates known to be closed or incompatible with the trip date/party constraints. Treat web availability as a signal, not a booking guarantee.
14. The existing frontend filter/tab `Bên ngoài` must display these persisted external sources. It must not be a cosmetic alias for manual or internal data.
15. Label external quote lines as `Nguồn bên ngoài · Giá web ước tính · Chưa xác minh`, show the citation, and allow a consultant to replace them later with a verified supplier offer.
16. Do not present a web estimate as a confirmed supplier quote or booking. Verified PostgreSQL supplier offers remain the authoritative option when available.
17. Add tests for empty results, provider timeout, duplicate external sources, malformed prices, currencies, adult/child price variants, seasonal closure, holiday hours, weather constraints, stale/conflicting citations, quote calculations, and citation propagation.
18. Show citations, confidence, date constraints, and verification status in the external-source list, itinerary activities, and quote lines.

Suggested new files following the existing module pattern:

- `backend/src/modules/agent/tools/search-web.tool.ts`
- `backend/src/modules/agent/tools/add-quote-item-from-external-source.tool.ts`
- `backend/src/modules/external-sources/external-source.service.ts`
- `backend/src/modules/external-sources/external-source.repository.ts`
- `backend/src/modules/external-sources/infrastructure/prisma-external-source.repository.ts`
- `backend/src/modules/web-search/web-search.service.ts`
- `backend/src/modules/web-search/web-search.provider.ts`
- `backend/src/modules/web-search/infrastructure/<provider>.web-search.provider.ts`
- corresponding tests under `backend/tests/`

Do not place provider calls directly in the route/controller or in the Gemma model adapter. Inject the web-search and external-source services into `TourAgentService`, matching the existing catalog and knowledge dependencies. The add-from-external-source tool must consume a server-issued search-result/external-source ID so the model cannot invent a price between search and persistence.

## 10. Verification status

Last verified backend result (2026-10-28):

```text
Test Files  21 passed (21)
Tests       98 passed (98)
Typecheck   passed
Build       passed
```

Agent LLM requests retry Gemini HTTP 4xx/5xx responses up to 7 times (8 attempts total) with capped exponential backoff. Each attempt has its own 60-second timeout; the overall agent timeout cancels the active attempt or retry wait. Retry and final provider-failure logs include the HTTP status, attempt count, and bounded provider message. Agent events are persisted as JSONL at the required `APP_LOG_FILE` path; local configuration points to `artifacts/logs/backend/application.jsonl`. Prompt tool history is compacted to at most 12,000 characters, retaining source IDs and relevant price/opening-hour evidence while trimming excerpts and older results as needed. Each model turn logs `promptChars` and tool-result count without logging prompt content.

Commands:

```powershell
cd D:\intern\tripwise\backend
npm test
npm run typecheck
npm run build
npx prisma validate
```

Frontend QA commands from the repository root:

```powershell
node scripts/qa/qa-api-sync.cjs
node scripts/qa/qa-style-restoration.cjs
node scripts/qa/qa-icons.cjs
node scripts/qa/qa-quote-inputs.cjs
```

The four frontend QA scripts passed after restoring the API script references.

## 11. Known issues and cautions

- `backend/README.md` is partially outdated: it says the agent can only add itinerary activities, but the current agent also searches knowledge/supplier offers and can add a quote item from an exact verified offer.
- The legacy frontend route does not encode a trip ID. Cross-tab or deep-link selection is therefore weaker than the removed React router implementation.
- The agent run is synchronous. Multi-turn Gemini requests can take tens of seconds; the frontend REST client currently defaults to a 10-second timeout unless overridden. Before exposing long agent tasks through the UI, give `runAgent` a longer bounded timeout or move runs to an asynchronous job/status model.
- A run may apply tools before a later model turn fails. The new empty-final fallback covers one common case, but a durable production design should persist agent-run state and expose partial completion explicitly.
- No authentication or authorization has been implemented yet, per the earlier user decision.
- Port `8081` was used only for an older comparison server and is not the active product URL. Continue on port `8080`.
- This directory currently did not report a Git repository from `D:\intern\tripwise`; verify repository placement before attempting commits or branches.

## 12. Recommended next sequence

1. Implement and test bounded web/places and public-price search.
2. Implement persisted `Nguồn bên ngoài` records and the controlled `EXTERNAL` quote flow using server-issued IDs.
3. Connect the existing `Bên ngoài` frontend filter to real external-source records, then add citations and verification badges to itinerary activities and quote lines.
4. Override the frontend agent request timeout or introduce asynchronous agent runs.
5. Backfill/re-index existing knowledge documents into Qdrant.
6. Update `backend/README.md` to match the actual agent tool set and startup requirements.
7. Run a browser smoke test: create a blank trip → ask agent to search places and prices → add activities and web-estimate quote lines → inspect citations/totals → replace one estimate with a verified supplier offer → reload and confirm persistence.


- 2026-10-28 UI follow-up: moved the estimated trip total directly below the selected quote services and above the separate service search/pagination section. Quote layout QA asserts this order.
- 2026-10-28 agent source-selection follow-up: removed the fixed internal-before-web sequence and internal-source preference. The agent may query relevant internal and public sources in either order or together, and must compare evidence quality, trip-date validity, itinerary fit, and total price. Knowledge search is conditional on whether internal travel context is useful. Public price estimates remain unverified and DEMO values remain test-only. Prompt regression tests cover the no-fixed-priority behavior.
- 2026-10-28 activity-price consistency follow-up: itinerary activities now require a preceding place-specific internal-offer or public-source price search. A matching priced offer/source must be linked through the corresponding itinerary-plus-quote tool; when no matching source exists, the model must state an `unpricedReason`, and the API returns a warning identifying that activity as lacking a verified price. Mismatched supplier offers and unsearched public source IDs are rejected. Prompt and service regression tests cover the behavior. No UI changes.
- 2026-10-28 live test follow-up: a real API run uncovered that unpricedReason leaked into Prisma activity data and that Gemini could end an explicit itinerary request with zero activities. The reason is now retained only in agent results/warnings; premature final responses are blocked and Gemini gets an explicit completion-required result. Regression coverage covers both cases.
- 2026-10-28 live API validation: created Tripwise test trip `4dc84309-874c-4d47-9f4d-a6482fabc157` (Seoul, 2026-12-15). Public search returned two persisted candidates; neither was suitable (best price-like result confidence 0.48), so the agent added two clearly unpriced suggestions and quote stayed at 0 items/0 VND. A second live agent run selected the verified DEMO Seoul guided-culture offer and linked its activity to one catalog quote line: 950,000 VND/person × 2 = 1,900,000 VND. Overall trip after test: 3 activities, 1 quote line. DEMO only; not a real market price.
- 2026-10-28 web-search allowance increased from three to five calls per agent run. The backend enforcement, model tool declaration and prompt now share the same configured constant; regression tests assert five provider calls and block the sixth.
- 2026-10-28 unpriced activity quote follow-up: agent-added activities without a matching price now get a persistent quote row linked to the itinerary item. API representation reports unknown unit price and line amount as null, UI shows `–` and `Cần kiểm tra giá`, and unknown amounts are excluded from the trip total. The line can be filled with a consultant-entered price; deleting its activity also removes the linked quote line and recalculates totals. Added enum/FK migration; database is up to date. Backend and frontend QA pass.
- 2026-10-28 DB normalization follow-up: unpriced activity quote lines persist machine-readable English values (`UNPRICED`, `ACTIVITY`, `visit`) and a null supplier snapshot. Frontend localizes them to Vietnamese (`Chưa có giá`, `lần`, `Cần xác minh giá`). Existing `NEEDS_REVIEW` rows are normalized by migration.
- 2026-10-28 supplier catalog flow correction: removed preferred-offer controls and the “Áp dụng lựa chọn vào chuyến đi” action. The catalog now only lists and manages supplier offers for agent/consultant reference; services are added to a trip from its quote tab. Removed the preference API endpoint and stopped exposing preference state in catalog responses. Existing `is_preferred` database column is retained but unused to avoid deleting stored data. Regression checks cover the removed UI/API and continued multi-offer catalog access.
- 2026-10-28 trips dashboard follow-up: replaced the hard-coded “Dữ liệu bản thử nghiệm · chưa đồng bộ” footer with a live state from the backend adapter (`Đang đồng bộ dữ liệu…`, `Đã đồng bộ máy chủ`, or `Trên thiết bị · chưa đồng bộ`). Trip rows now paginate 10 per page; search and status filters reset pagination, page is kept in the URL, and the footer reports the displayed range. Added dashboard regression assertions.
- 2026-10-28 dev-environment transition: made the backend database authoritative for trips, catalog, and knowledge; removed browser demo seeding and fake sample itinerary flows, with offline local storage limited to read-only last-server-snapshot fallback. Kept existing persisted test/demo rows intact. All trip/catalog/knowledge pages hydrate from server pagination and writes (intake, agent runs, activity/quote edits, supplier offers, knowledge, and review state) go through backend APIs. Removed invented travel-time estimates and changed the UI to state when travel time is not configured. Updated stale fallback labels that described server data as demo/sample prices. Added `scripts/qa/qa-dev-mode.cjs` (25 assertions). Verification: frontend QA scripts passed (all seven); backend `npm test` passed 100 tests across 21 files, `npm run typecheck`, `npm run build`, and `npx prisma validate` passed.
- 2026-10-28 supplier catalog UI follow-up: API inspection confirmed there are 9 distinct service records (14 offers), not exact duplicate service rows. Separated the 3 intentionally persisted `[DEMO]` services into a collapsed “Dữ liệu kiểm thử” section, keeping them in the server catalog for agent testing. Added per-service offer counts and changed desktop supplier table columns to proportional widths with a dedicated edit column; offer conditions wrap within their column. Verified the updated catalog in the running Chrome page after reload. `scripts/qa/qa-supplier-offers.cjs` now has 42 assertions.
- 2026-10-28 supplier catalog correction: removed the separate “Dữ liệu kiểm thử” category only; retained the 3 seeded services, their 3 verified offers, and the indexed knowledge seed in the database. The 3 seeded service groups sort first in the normal catalog. Frontend source QA passes (44 supplier assertions and all seven scripts). During live browser checking, the page loaded a stale 6-service/11-offer snapshot while backend socket access was blocked in this sandbox; an attempted backend test run likewise hit sandbox `EACCES` on Vitest’s local test-server ports (66 passed, 37 could not bind). Typecheck, build, Prisma validation and JavaScript syntax passed. Recheck live API/database sync outside the restricted sandbox.
- 2026-10-28 quote source navigation: changed “Xem báo giá nguồn” to open the complete supplier catalog, retain normal sorting/search context, highlight the exact offer, and scroll it into view rather than filtering the catalog down to one service. Verified source-level regression assertions (49 supplier assertions), frontend QA scripts, and JavaScript syntax.
- 2026-10-28 agent search policy: removed the dedicated five-call `search_web` cap from runtime enforcement, Gemini tool description, and prompt. Search now uses the overall agent run budgets (configured model turns/tool calls and request timeout), with prompt guidance to avoid duplicate/irrelevant queries. Updated regression tests; focused agent/model tests pass (27 tests), typecheck/build pass. Full test run: 66 passed; 37 API tests could not bind local test sockets due sandbox `EACCES`.

## 0.9. Service metadata and supplier-offer semantic search

- Removed the service-level `description` field from the Prisma schema and catalog API contract. Supplier offers now store their descriptive content in `details`; the supplier catalog editor/table labels this field “Thông tin chi tiết”. Quote history continues to use its immutable `termsSnapshot` field.
- Added migration `20261028140000_catalog_offer_details`: renames `supplier_offers.terms` to `details`, copies any existing service description into every linked offer's details, then drops `services.description`.
- Added a dedicated catalog Qdrant collection configured by `QDRANT_CATALOG_COLLECTION` (default `tripwise_catalog_offers`), separate from the internal knowledge collection. Embeddings include service name/category/unit, supplier name, price/currency/unit, validity, verification state, and offer details.
- Catalog offer create/update, service metadata/activation changes and supplier rename refresh affected offer vectors. Startup reindexes catalog offers. Only active services with verified offers are indexed; agent results are hydrated from PostgreSQL and rechecked before being returned. Semantic results are combined with keyword fallback.
- Agent `search_supplier_offers` now uses semantic catalog search. Demo seed writes service metadata only on service and descriptive content on offer `details`.
- Verification: focused non-socket tests passed (41 tests); Prisma validation, backend typecheck/build, seven frontend QA scripts and JavaScript syntax checks passed. API tests using Supertest could not bind local ports in this sandbox (`EACCES`); migration has not been applied to the local database in this turn. Restart backend and apply pending Prisma migration before testing the live agent.

## 0.10. Manual activity entry and source links

- Removed the duplicate “Thêm hoạt động vào ngày …” control at the bottom of each itinerary day; the day header action remains.
- Activity creation now uses the currently selected day without showing a separate journey-day field. Quantity and location share a row; price and pricing unit share a row.
- Added Internal/External source selection. Internal sources are selectable from verified, date-valid supplier offers. External sources accept an HTTP(S) URL; the URL is persisted on the itinerary item and quote snapshot. If a valid existing external-source record has the same URL, the activity/quote link to it; a pasted URL alone is not treated as verified evidence. A price can be entered manually, otherwise the quote keeps an unknown price (`–`).
- Added `source_url` and `source_url_snapshot` columns via migration `20261029103000_itinerary_quote_source_urls`.
- Verification: backend typecheck/build and JavaScript syntax checks passed. Test suites were not run. Apply the new Prisma migration to the dev database and reload the frontend before trying the form.
- 2026-10-29 UI follow-up: internal/external source inputs now switch exclusively (CSS explicitly honors the `hidden` attribute); activity creation shows location before quantity; the day-level Add button uses the primary green style. Removed lock/edit icons from activity cards and made the activity title an accessible edit button. Existing locked items can now be edited/deleted through the card flow since no lock toggle remains visible. Backend typecheck/build and both frontend JavaScript syntax checks passed; test suites not run.
- 2026-10-29 activity editor layout: moved “Xóa hoạt động” into the form action row, aligned left while Cancel/Save stay on the right. Frontend JavaScript syntax checks pass.
- 2026-10-29 supplier catalog typography: offer prices in the service catalog use regular font weight; service names remain bold.
- 2026-10-29 quote status labels: web-source rows always display the single label “Giá web ước tính”, regardless of their internal verification metadata. “Trong báo giá” and “Cần kiểm tra giá” are reserved for internal quote rows. Removed the web verification toggle from the UI and API contract; agent-entered web prices remain unverified by default.
- 2026-10-29 quote quantity layout: moved each quote unit from the service-name cell into the quantity cell beside its quantity input; adjusted column proportions to fit both cleanly.
- 2026-10-29 quote unit-price display: show the VND symbol “đ” after the unit-price input; the service pricing unit stays beside quantity.
- 2026-10-29 quote price-field sizing: reduced the unit-price input width from 116px to 100px.

## 2026-10-29 agent search/catalog implementation
- Each web, knowledge, and verified catalog search independently caps results at 5; defaults and schema/provider/service limits agree.
- Enforced one optional supplier price per service in Prisma, backend types, and API; second-price creates return `409 SERVICE_PRICE_EXISTS` while existing API output remains `offers: [] | [offer]`.
- Migration `20261029120000_one_offer_per_service` applied to local PostgreSQL after disposable-schema verification. It split 5 duplicate groups while preserving all offer IDs and remapping quote/plan-version references. DB totals: 22 services, 22 offers, 0 duplicate-service groups, 0 mismatched quote links.
- Qdrant embedding hash now incorporates `serviceId`, forcing startup reindex to refresh vector payloads when an offer was reassigned during migration.
- Verification: backend tests 25 files / 144 tests passed; typecheck, build, Prisma validate/status and frontend JS syntax passed. Migration fixture passed. `scripts/qa/qa-supplier-offers.cjs` still fails on a stale expected quote-tab sentence, unrelated to these changes.
- No Git metadata exists in this workspace; changes remain uncommitted. Qdrant payload reindex is triggered at backend startup; this session did not restart or verify the running backend process.
- 2026-10-29 agent-tool contract follow-up: removed `limit` from model-visible web, knowledge, and supplier-search schemas/function declarations. Agent sends only query/category; search services read the shared required `AGENT_SEARCH_RESULTS_PER_TOOL` environment setting (local/example value 5). Removed scattered hard caps and old separate web/knowledge limit variables. Tests verify configured counts and query-only tool declarations.
- 2026-10-29 search-count configuration audit: audited active backend source, generated backend build output, `.env`, `.env.example`, README, spec, and implementation plan. Replaced separate web/knowledge result variables and catalog's independent literal cap with required `AGENT_SEARCH_RESULTS_PER_TOOL`; development and sample config remain 5. Search services own the count, agent calls and model declarations cannot provide it. Removed stale env names from README/config, updated docs and progress. Final backend test suite: 25 files / 147 tests passed; typecheck and build passed.
- 2026-10-29 broad hard-coded configuration audit: made operational backend values required in `env.ts` and wired Gemma retry/timeout/context/output/research budgets, Qdrant timeout/batch sizing, CORS origins, request body limit, agent rate limit, web/knowledge/catalog result cap, knowledge chunking, and agent runtime timeout through configuration. Removed knowledge service's hidden chunk/search defaults and obsolete web-search cap. Added `frontend/runtime-config.js` for frontend API URL/timeouts and made the static server require explicit root, port, and host. Updated QA checks and backend setup documentation. Remaining literals are API/domain contract values (empty optional request-field defaults, pagination defaults/caps, validated field lengths, HTTP/status codes, and unit conversions), not deployment settings.
- Verification for this audit: focused backend tests 5 files / 52 tests passed; TypeScript typecheck/build passed; `scripts/qa/qa-api-sync.cjs`, `scripts/qa/qa-dev-mode.cjs`, frontend JS syntax checks passed; local `.env` contains every key in `.env.example`. Full backend suite ran 17 files / 114 passing, while 35 HTTP API tests were blocked because sandbox denied Supertest loopback sockets (`EACCES`). Legacy `scripts/qa/qa-supplier-offers.cjs`, `scripts/qa/qa-trips-dashboard.cjs`, and `scripts/qa/qa-quote-inputs.cjs` also contain assertions for earlier UI copy/layout and still fail against current implementation; they are unrelated to runtime configuration changes.
- 2026-10-29 quote price-field sizing: reduced the unit-price input width further from 100px to 88px.

## 2026-10-29 agent external price conversion
- The agent tool accepts one shared `unit`, the exact public source price in that currency's minor unit, and its source `unitPriceCurrency`; it no longer requires the model to provide the trip's quote currency or calculate an exchange rate.
- Backend converts source prices into the trip budget currency before creating the quote line, including prices selected by `externalSourceId`. It stores the original amount/currency and the conversion provider, rate, and effective date in quote terms. Public prices remain unverified. If a non-identity rate cannot be retrieved, the quote mutation fails with an exchange-rate error rather than storing an invalid amount.
- Added the configurable Frankfurter rate provider (`FX_RATE_API_URL`, `FX_RATE_TIMEOUT_MS`, `FX_RATE_CACHE_TTL_MS`) and adjusted web price extraction to normalize currencies with fractional minor units. Local backend `.env` was populated with the matching settings.
- Source: Frankfurter API covers VND and publishes dated reference rates [currency coverage](https://frankfurter.dev/currencies/vnd/) [API docs](https://frankfurter.dev/).
- 2026-10-29 project launch scripts: added `scripts/start/ubuntu.sh`, `scripts/start/windows.ps1`, and `scripts/start/windows.bat` to keep start tooling out of the project root. They start PostgreSQL/Qdrant, wait for healthy containers, create `.env` from the example if missing, install backend dependencies when absent, generate Prisma, apply migrations, then start API and frontend. Documented both launch options and URLs in backend README.
- 2026-10-29 startup verification: launched via `scripts/start/windows.ps1`; PostgreSQL/Qdrant are running, Prisma client generated, no pending migrations, frontend returned HTTP 200 and backend health returned `ok` at port 3101.
- 2026-10-29 live agent smoke test: reran the existing 2-day Seoul trip (`0f8ff53a-cbeb-4bec-a0e0-f93ae8aa6c52`). Agent completed successfully in 7 model turns / 10 tool calls (484.9s), saved 2 activities (Gyeongbokgung on day 1; Bukchon Hanok on day 2), and returned 3 sources. Web calls each returned 5 results. Gemini returned transient HTTP 500s on later turns and recovered through retry. Largest logged full prompt was 16,273 characters, down from the previous 135,940-character prompt. Completion fallback was not invoked because the model completed the itinerary itself.

## 2026-10-29 agent search context limit
- Reduced AGENT_SEARCH_RESULTS_PER_TOOL from 5 to 3 in local and example backend configuration. Web, internal knowledge, and verified service catalog tools each return at most three results per invocation; the model still cannot choose this count.
- The running backend reads this setting at startup, so restart the backend for the new limit to take effect in an active session.

## 2026-10-29 agent price-first itinerary prompt
- Replaced repetitive and contradictory itinerary prompt rules with a shorter workflow that strongly prefers a source-backed price and asks the agent to search again when the first results lack one.
- Removed keyword/query-count gates that tried to infer whether the agent had searched enough or whether a result matched an activity. Any add without a price now returns `PRICE_RESEARCH_CONFIRMATION_REQUIRED` with an activity-bound confirmation ID; the agent decides from its search/history whether to research further, attach a found price, or retry with that ID and an honest no-price reason. Exact source URLs and offer IDs still must come from the corresponding search tool.
- When the main research budget is exhausted, the completion fallback makes no new searches but reuses a source from its history when available; otherwise it records an honest unpriced reason.
- Verification: backend typecheck/build passed; automated tests were not run.

## 2026-10-29 service catalog row editing
- Removed the service catalog action column and per-row edit/delete icons. Clicking the service name opens one editor for service name, unit, category, the single supplier offer price, verification state, and details.
- Moved service deactivation into the editor and replaced the browser confirmation with an app-owned confirmation that explains historical prices and quote links are retained.
- Updated supplier table column sizing and the UX contract. Verification: JavaScript syntax and whitespace checks; test suites not run.

- 2026-10-29 service catalog spacing follow-up: narrowed the trailing category column from 16% to 10% and gave the reclaimed width to details, removing the unused right-side space.

## 2026-10-29 agent prompt tool-result projection
- Added a prompt-only projection for web, knowledge, and supplier search results plus successful mutation acknowledgements. It removes duplicate/internal identifiers and timestamps, normalizes web URL/source fields, and retains the full excerpt and substantive source content without an excerpt-specific cap. Backend agent state keeps the original result objects for source/offer validation. The same projection is used for normal turns and completion-fallback history.
- Verification: backend TypeScript typecheck passed; test suites not run.

- 2026-10-29 correction to web prompt payload: removed backend-parsed price/currency, audience, pricing unit, opening-hours/evidence enrichments from model-visible search results. Web result keeps the original excerpt unchanged with title, URL, publisher, and required source-link/eligibility metadata; full original state remains for backend operations.
- 2026-10-29 removed backend suitability/confidence decisions from the agent-facing web results and source-selection gates. External sources are no longer hidden or rejected based on opening-hours availability, weather inference, source-domain heuristics, stale age, or a numeric confidence threshold. Removed the unused external-source `REJECTED` status; the migration maps any legacy rows to `UNVERIFIED` so source records are retained.

## 2026-10-30: Google Places venues and day itinerary map

- Added optional backend Google Places (New) provider, trip scoped search route, expiring candidate store, bounded per-IP rate limit, and per-day map hydration. The itinerary stores only `googlePlaceId` alongside authored activity data; map coordinates/name/address are fetched transiently when the map opens.
- Agent tool declarations now include `search_places`; both activity-add paths require an exact same-run place candidate and `selectionReason` when Places is configured. External price sources no longer implicitly define the itinerary venue. Completion fallback cannot search or invent a candidate.
- Added the manual place picker with stale request cancellation, branch address disambiguation, candidate invalidation on typing, and optional selection reason. Added a compact trip cover and per-day map with grouped colocated pins, safe text-only reason popups, and timeline fallback.
- Added nullable `google_place_id` via additive migration `20261030012312_itinerary_google_place_id`; local database migration was applied earlier in this implementation without resetting existing rows.
- Google keys are intentionally not present in the repository. Configure `GOOGLE_PLACES_API_KEY` in backend environment and restricted `googleMapsBrowserApiKey` plus `googleMapsMapId` in `frontend/runtime-config.js` to enable live search/maps. Terms/privacy links, billing/quota restrictions, and key restrictions remain release setup.
- Verification: backend typecheck/build and Prisma schema validation passed; focused unit and QA results are recorded in the current task ledger. No live Google request was made.

## 2026-10-30 OSM provider switch

- Replaced Google Maps/Places with Leaflet, OpenStreetMap tiles, and Photon search. No Google key, Map ID, or Google billing configuration is required.
- Planning and agent contracts use provider-neutral `placeId`; chosen OSM metadata (provider, ID, display name, address, coordinates) is stored on itinerary items so each day map can show pins and `selectionReason` popups without another search.
- Added an additive migration that preserves existing Google Place IDs as `GOOGLE_LEGACY`; legacy activities remain visible but need an OSM result selected to appear as map markers.
- Photon demo and OSM tiles are best-effort community services. Search is serialized/cached; production scale should use an OSM-compatible hosted provider or self-hosted service.
- Verification is pending Prisma regeneration/schema validation, backend build/typecheck, and frontend syntax checks. Database migration and live map request are pending restart via `script/start`.
