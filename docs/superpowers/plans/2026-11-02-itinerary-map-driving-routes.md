# Itinerary Map Driving Routes Implementation Plan

> **For agentic workers:** Native implementation in this session, following the single task below.

**Goal:** Draw actual driving routes and per-leg distances on the itinerary map only.

**Architecture:** Keep current Leaflet markers. Make one cancellable OSRM route request for resolved day points in schedule order; render each leg geometry and distance as map layers. A route failure leaves markers visible and shows a map-only status.

**Tech Stack:** Existing vanilla JavaScript, Leaflet, OSRM HTTP Route API.

**Spec:** `docs/superpowers/specs/2026-11-02-itinerary-map-driving-routes-design.md`

## Global Constraints
- Route mode is driving.
- Route and distance labels appear only on the map.
- Use existing company color tokens and current Leaflet dependency.
- Abort route requests when the map is disposed or the selected day changes.
- Keep markers visible when the external routing request fails.

## Review Focus
- Fewer than two distinct resolved points: do not request or render a route.
- Consecutive duplicate coordinates: avoid an invalid or zero-length route waypoint.
- OSRM error, malformed response, or network failure: preserve markers and show a concise map status.
- Stale response after day switch: ignore it.
- Missing geometry for an individual leg: do not crash map rendering.

### Task 1: Render driving route legs and distances on the map

**Files:**
- Modify: `frontend/itinerary-map.js`
- Modify: `frontend/redesign.css`

**Interfaces:**
- Consume the existing resolved map points and active `AbortController`.
- Add route layers to the same Leaflet map and clean them up through existing map disposal.

- [x] Request OSRM once with ordered coordinates, `steps=true`, `geometries=geojson`, and `overview=false`.
- [x] Render each leg's step geometry and a km label based on the leg's OSRM distance.
- [x] Preserve existing markers and show a map-only route status for unavailable routing.
- [x] Confirm JavaScript syntax and inspect the active browser map with multiple waypoints.
