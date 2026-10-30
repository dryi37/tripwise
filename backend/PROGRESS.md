
## 2026-10-30 itinerary selection rationale field

- Added optional nullable `selectionReason` to itinerary activities and the planning API/response. The database migration adds `itinerary_items.selection_reason`; existing activities remain null.
- Both agent activity tools accept and request a concise rationale grounded in available trip and source information. The rationale stays separate from the customer-facing `description`; no UI currently displays or edits it.
- Prisma client regenerated. Backend typecheck and `git diff --check` passed; automated tests were not run.

## 2026-10-30 Google Maps venue as the only activity location

- Removed the free-form activity `location` field from the Prisma model, planning API/repository types, agent tool payloads, and frontend state/payloads. Agent/form pass `googlePlaceId` directly; backend checks it against recent search results scoped to the trip/run before saving.
- The per-day Places response supplies the Google display name and Maps URI to the visible timeline; the name is not copied into activity records or browser snapshots.
- The agent and manual form send the `googlePlaceId` returned by Places search directly. The server validates that ID against the recent search allowlist for the correct trip and agent run; no separate token is exposed to them.
- Added migration `20261030130000_remove_itinerary_location`: it drops `itinerary_items.location` and removes the old `location` key from saved plan-version JSON. Existing activities without a Google Place ID will show as unlinked and need a Maps selection.
- Regenerated Prisma Client and `npm run build` passed. Automated tests were not run.

## 2026-10-30 provider switch to OpenStreetMap

- Superseded the Google provider with Photon place search and Leaflet/OSM tiles. Backend configuration now has public Photon URL, timeout/cache, and place search limits; no API key is required.
- Activity contracts use `placeId`; selected provider, ID, name, address, and coordinates persist so the day map reads saved selections. Agent activity creation continues to require a search result and `selectionReason`.
- New migration preserves Google-era identifiers as `GOOGLE_LEGACY` and rewrites historical snapshots without dropping those IDs. They are unresolved on the OSM map until reselected.
- Prisma regeneration, typecheck/build, migration application, and live UI verification are pending.
