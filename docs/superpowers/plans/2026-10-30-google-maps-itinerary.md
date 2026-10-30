# Google Maps Itinerary Implementation Plan

> **Implementation steering (2026-10-30):** The user selected the no-Google-cost alternative. Replace Google Maps/Places in this plan with Leaflet + OpenStreetMap tiles + Photon. Earlier Google-specific steps below record the original plan and are superseded where they conflict.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not begin implementation until the user has reviewed the draft spec and plan.

**Goal:** Mỗi hoạt động mới gắn một địa điểm Google cụ thể; bản đồ theo ngày hiển thị lý do chọn địa điểm.

**Architecture:** Backend Places provider/service trả Google Place IDs và giữ allowlist tạm theo trip/run; planning/agent gửi cùng `googlePlaceId` và dùng chung validation. Frontend vanilla JS dùng Maps JavaScript API và Advanced Markers trong một controller có lifecycle riêng, giữ timeline và quote contracts hiện có.

**Tech Stack:** Express/TypeScript, Prisma/PostgreSQL, Vitest, vanilla JS/CSS, Maps JavaScript API, Places API (New).

**Spec:** `docs/superpowers/specs/2026-10-30-google-maps-itinerary-design.md` (DRAFT).

## Global constraints

- Chưa triển khai ở lượt viết tài liệu này; không migration, không gọi Google trả phí, không thay dữ liệu chuyến đi.
- Không tạo React app hoặc đổi frontend framework. Giữ backend route → controller → service → repository/provider và dependency injection hiện có.
- Persist Place ID và authored fields; không persist Google name/address/coordinates/raw payload trong snapshot/DB/browser fallback.
- New activity cần Google Place ID từ Places search trong đúng phạm vi; legacy null Place ID vẫn đọc/restore. Agent reason bắt buộc, manual reason tùy chọn.
- Không Directions, Routes, đoán thời gian di chuyển, fake pin hoặc tự suy ra giá từ Google Places.
- Có kiểm thử tập trung cho validation, state/races và regressions quote; không dùng live Google quota trong suite tự động.

## Review focus

- Legacy snapshot thiếu field, edit đổi venue và lý do cũ không còn đúng.
- Candidate hết hạn/cross-trip, chi nhánh cùng tên, địa điểm chung và Places unavailable khi fallback đang chạy.
- Ngày đổi nhanh khi request cũ chưa hoàn tất; DOM rerender do chat phá map instance.
- Trùng tọa độ, touch/keyboard, popup dài và văn bản có HTML nguy hiểm.
- Quota/key restriction/partial provider failure và dữ liệu Google lọt vào snapshots/log/localStorage.

## File map

Create module `backend/src/modules/places/`: `places.types.ts`, `places.provider.ts`, `places.service.ts`, `places.schemas.ts`, `places.controller.ts`, `places.routes.ts`, `place-candidate.store.ts`, `infrastructure/google-places.provider.ts`.

Modify `backend/src/config/env.ts`, `.env.example`, `app.ts`, `server.ts` for optional feature configuration and wiring; local `.env` only gets nonsecret settings, API key supplied separately.

Modify `backend/prisma/schema.prisma`, new additive migration; planning types/schemas/service/repositories and version restore mapping. Extend agent model/schema/adapter/service and relevant fixtures.

Create frontend `google-maps.js`, `itinerary-map.js`, `place-picker.js`; modify `index.html`, `runtime-config.js`, `api-client.js`, `api-sync.js`, `redesign.js`, `redesign.css`; inspect/adjust `app.js` fallback activity creation/serialization where applicable. Update `DESIGN.md`, `UX-CONTRACT.md`, `backend/README.md`, `PROGRESS.md` after implementation.

## Task 1: Places boundary, configuration and provider

- [ ] Add injectable provider types for search/details. Fix field masks to required fields only; Text Search POST and Details GET via configured endpoint, keys in headers, AbortSignal/timeout propagated.
- [ ] Add validated optional feature config: server key, API URL/timeouts/search-result TTL/rate limits; browser public restricted key and map ID. Feature disabled cleanly when key missing; no hidden deployment constants.
- [ ] Implement trip-scoped search allowlist with run scope when applicable, configured TTL, bounded memory eviction, and explicit expired/scope errors for submitted Place IDs. Raw Places data remains transient.
- [ ] Implement search with destination context, result count from `AGENT_SEARCH_RESULTS_PER_TOOL`, concrete-place validation and no auto top-result selection. Do not ship a brittle narrow venue type allowlist that excludes actual attractions.
- [ ] Add tests `backend/tests/google-places.provider.test.ts`, `places.service.test.ts`, `place-candidate.store.test.ts`: field mask, timeout/429, malformed coordinates, locality rejection, ambiguous branches, exact Place ID allowlisting, expiry, eviction and scope. Mock provider HTTP; no billable requests.
- [ ] Wire provider/service to `server.ts` and app dependency types; add route-level rate limits and sanitized failure logs. Check missing config leaves existing app healthy.

Deliverable: testable backend venue search with no itinerary mutations.

## Task 2: Persist place linkage through planning and versions

- [ ] Add nullable `googlePlaceId` to Prisma and planning types. Create named additive migration via `npx prisma migrate dev --create-only --name itinerary_google_place_id`; inspect SQL before applying to local DB. Existing rows must remain null and intact.
- [ ] Extend planning create/update DTOs with `googlePlaceId`; validate it against the recent trip/run search store. Reject arbitrary IDs/coordinates and scoped/expired selections. Nonplace edits preserve ID; venue changes clear stale reason unless a replacement is supplied.
- [ ] Retain atomic activity/quote mutation, expected revision and idempotency. Provider validation occurs before committing; no orphan quote on failure. Do not require Google lookup on unchanged legacy item reads.
- [ ] Update Prisma and in-memory planning repositories, API serializers, test fixtures, and version snapshot/restore mapping. Old snapshot missing field maps to null; restore persists IDs without external provider dependency.
- [ ] Extend `planning.service.test.ts`, `planning.api.test.ts`, `planning.source.api.test.ts`, `prisma-planning.repository.test.ts`, `versions.api.test.ts`: legacy edits, new activity enforcement, arbitrary/cross-trip/expired Place ID rejection, revision conflict, source-price independence, version roundtrip and venue/reason change behavior.
- [ ] Apply reviewed additive migration only during implementation, generate client, check row counts/sample legacy rows before/after.

Deliverable: valid venue linkage survives reload/versions without storing Google content.

## Task 3: Trip Places APIs and map hydration

- [ ] Register `POST /api/v1/trips/:tripId/places/search` and `GET /api/v1/trips/:tripId/itinerary/map?dayIndex=N` in places router/controller/service, mounted through `app.ts`.
- [ ] Validate trip/day/query; cap results; avoid sending brief/customer identity to Google. Use bounded details concurrency, request abort and deduplicate Place IDs per map request.
- [ ] Map response includes activityId-linked successful DTOs and unresolved status per activity. Transient details not merged into persisted activity objects.
- [ ] Add `backend/tests/places.api.test.ts`: invalid trip/day, partial details errors, no ID, duplicate venue, rate limit, missing key, obsolete Place ID, no secret/payload in error output.
- [ ] Update frontend API client with search/map calls; ensure existing snapshot fallback never persists hydration response.

Deliverable: UI can hydrate only the selected day's venues and handle partial failures.

## Task 4: Concrete venues in agent tools and fallback

- [ ] Add `search_places` to `agent-model.ts`, `tour-agent.schemas.ts`, Gemini declarations, dispatch and dependency injection; no model-controlled result limit. Search consumes existing run budget/deadline and scopes returned Place IDs to the run.
- [ ] Require `googlePlaceId` from prior `search_places` and nonempty `selectionReason` on both agent activity mutation paths. Keep all public-price/internal-offer validation and unpriced confirmation behavior.
- [ ] Change external-source add path so source name is not automatically treated as a Google venue. The agent must choose a place independently and provide an activity title; venue identity comes only from its Place ID.
- [ ] Update prompt projection/compaction to preserve `googlePlaceId` values needed for subsequent mutation; original validation state stays server-side.
- [ ] Amend main/fallback prompts and execution gates: no search in completion fallback, only valid Place IDs from history; if none remain valid, leave day incomplete and name missing days. Remove forced-add instructions that tell model to use generic geographic knowledge without a valid place.
- [ ] Extend `tour-agent.schemas.test.ts`, `tour-agent.service.test.ts`, `gemma-agent.model.test.ts`, `tour-agent.api.test.ts`: fake/cross-run/expired Place ID, both add tools, missing reason, no-price flow, exhausted budget, incomplete fallback, no fabricated coordinates and prompt compaction retaining IDs.

Deliverable: an agent cannot satisfy itinerary completeness with vague city-level activities.

## Task 5: Place picker in manual create/edit

- [ ] Implement `place-picker.js` using shared backend search. Debounce inputs, abort/discard stale results, handle keyboard selection/Escape/touch and show address to disambiguate venues.
- [ ] Integrate with the active `activityForm` in `redesign.js` and API sync mutation mapping; audit `app.js` fallback handlers so no alternate new-activity path bypasses selection.
- [ ] Typed text invalidates the selected Place ID. Edit nonplace fields on legacy works; choosing a new venue clears stale reason and requires a new search if the selection expires. Show manual rationale textarea optional; keep source-price controls independent.
- [ ] Add focused frontend QA under `scripts/qa/qa-place-picker.cjs` for selection invalidation and out-of-order responses; prefer DOM/runtime interaction assertions over matching generated strings.
- [ ] Browser check search/select/save/reopen, same-name branches, long foreign-language addresses, provider unavailable and legacy edit. No live provider mutation is required for mocked interaction checks.

Deliverable: consultant-created activities have the same concrete venue guarantee as agent-created ones.

## Task 6: Compact cover and day map controller

- [ ] Implement lazy, singleton Maps JS SDK loader in `google-maps.js`, loading maps/marker libraries with configured browser key/map ID. Handle auth/billing/load errors without retry loops.
- [ ] Implement `itinerary-map.js` lifecycle keyed by trip/day: mount/update/dispose; abort pending hydration; reject stale responses; retain map on unrelated chat/quote rerenders. Use AdvancedMarkerElement and text-safe popup DOM.
- [ ] Replace oversized cover with compact metadata; place day rail before map and timeline after map. Update map on selected day, CRUD, agent refresh and version restore; fit bounds only when day/data genuinely changes.
- [ ] Add numbered markers, same-location grouped selection, popup hover/focus/touch/close and card focus links. Keep map details out of persisted UI model/localStorage.
- [ ] Add loading, empty, legacy-unresolved, partial-failure, key-missing and retry states. Preserve Google attribution and accessible fallback activity list.
- [ ] Add `scripts/qa/qa-itinerary-map.cjs` with SDK/provider doubles: rapid day switching, one/zero/many points, duplicate locations, removed activity, stale popup, rerender lifecycle, unsafe reason strings and no hydration persistence.
- [ ] Real browser checks at desktop and 390px mobile: compact cover/map proportions, keyboard navigation, hoverable popup, long rationale, touch selection, reduced motion, no horizontal overflow.

Deliverable: map matches selected day and explains venue choices without losing timeline usability.

## Task 7: Integration, documentation and acceptance review

- [ ] Update active `DESIGN.md` map rule and `UX-CONTRACT.md` for place picker, tooltip/touch behavior and unresolved legacy items. Update backend README with keys/API enablement, billing, restrictions, map ID, cache policy and commands; no real secrets committed.
- [ ] Add Terms/Privacy links required for intended Google usage before nonlocal release; restrict both keys and configure quotas. This is setup work, not a request to enable billing during documentation.
- [ ] Run focused backend suite: `npm --prefix backend test -- places.api.test.ts places.service.test.ts google-places.provider.test.ts place-candidate.store.test.ts planning.service.test.ts planning.api.test.ts planning.source.api.test.ts versions.api.test.ts tour-agent.service.test.ts tour-agent.schemas.test.ts gemma-agent.model.test.ts`.
- [ ] Run `npm --prefix backend run typecheck`, `npm --prefix backend run build`, `npx --prefix backend prisma validate --config backend/prisma.config.ts`, frontend `node --check` on modified scripts, and the two new frontend QA scripts. Adjust Prisma invocation to run from `backend/` if config path resolution requires it.
- [ ] Run existing `qa-api-sync.cjs`, `qa-dev-mode.cjs` and relevant quote regressions; previously stale source assertions must be reported explicitly, never silenced to claim this feature works.
- [ ] With user-supplied restricted keys/billing, perform one bounded live smoke: trip with two days → agent selects real venues → verify day pins/reasons → manual edit venue → reload → snapshot/restore. Confirm original data/quote values unchanged except intended edits. Without credentials report live Google acceptance unverified.
- [ ] Record evidence and remaining setup in `PROGRESS.md`; do not claim every day complete when no valid venue could be found. Review spec acceptance criteria before requesting implementation completion approval.

## Draft choices to review

One venue anchor per activity, no routes in this phase, one map in the main itinerary column beneath day selector, manual rationale optional, legacy venue resolution explicit, and fallback allowed to report incomplete rather than fabricate venues. API keys/billing are implementation prerequisites, not required to review these documents.

## 2026-10-30 follow-up: remove manual venue text

- [x] Remove `location` from the Prisma activity model, planning DTOs, repository mapping, agent tool schemas/prompts, and frontend activity payloads.
- [x] Use `googlePlaceId` directly in agent/form/API search and mutation contracts; keep a scoped/expiring server search allowlist. Keep display names transient in Places responses and render them in the timeline.
- [x] Add a migration that drops the activity location column and removes old `location` values from JSON version snapshots. Existing rows without a Place ID render as unlinked and must be selected again on Google Maps.
- [x] Keep URL inputs identified as price provenance only; they do not provide or label the venue.

## 2026-10-30 provider switch: OpenStreetMap

- [x] Replace the Google Places provider with Photon venue search and preserve the trip/run scoped expiring place ID allowlist.
- [x] Replace Google IDs with provider-neutral `placeId` in planning and agent contracts; persist the selected OSM provider, ID, display name, address, and coordinates.
- [x] Replace the Google Maps browser loader with Leaflet and the OpenStreetMap tile layer; retain numbered day markers, grouped same-location activities, safe reason popups, attribution, and retry/fallback states.
- [x] Add migration to preserve existing Google place references as `GOOGLE_LEGACY` without interpreting them as OSM IDs; legacy activities can be relinked through OSM search.
- [x] Remove Google key and Map ID requirements from frontend runtime config and backend `.env.example`; keep the local `.env` values untouched but unused.
- [x] Regenerate Prisma Client and validate the Prisma schema; backend build and frontend syntax checks pass. `npm run typecheck` still reports existing test fixtures that reference the removed Google provider/fields; automated tests were not run.
- [x] Started PostgreSQL/Qdrant and the local API/frontend; applied `20261030160000_switch_itinerary_places_to_openstreetmap` without resetting the database. Health returns `ok` and frontend returns HTTP 200.
- [x] Live Photon request responds HTTP 200 and returns OSM type/ID, venue name, and coordinates for Gyeongbokgung Palace. Fixed destination context to append only the city before a comma; the localized country suffix caused Photon to return no matches. Tripwise API smoke now returns three results with an OSM ID and coordinates.

Operational constraint: Photon demo may throttle or block heavy use and has no availability guarantee; retain visible attribution and move to a hosted provider/self-hosting if usage grows.
