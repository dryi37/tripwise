# Itinerary Draft and Quote Backend Design

## Intent

Extend the Tripwise backend with the deterministic itinerary and quotation core that the future Gemma/LangGraph workflow will call as tools. Authentication and authorization are intentionally deferred by user request.

## Chosen approach

Add one `planning` module using the existing Route → Middleware → Controller → Service → Repository boundaries. A trip owns one mutable draft and one mutable quote. Every mutation uses an expected draft or quote revision, writes atomically, and increments that revision.

## API

- `GET /api/v1/trips/:tripId/draft`
- `POST /api/v1/trips/:tripId/draft/items`
- `PATCH /api/v1/trips/:tripId/draft/items/:itemId`
- `DELETE /api/v1/trips/:tripId/draft/items/:itemId`
- `GET /api/v1/trips/:tripId/draft/quote`
- `POST /api/v1/trips/:tripId/draft/quote/items`
- `PATCH /api/v1/trips/:tripId/draft/quote/items/:itemId`
- `DELETE /api/v1/trips/:tripId/draft/quote/items/:itemId`

## Rules

- The draft and quote are created lazily when first read or mutated.
- Activity dates are represented by `dayIndex`; times are local `HH:mm` values with an explicit IANA timezone.
- End time must be after start time. Day index must fit inside the trip date range.
- Locked itinerary items reject updates and deletion unless the mutation only sets `isLocked` from true to false.
- Quote quantity is a positive integer in this slice. Money is stored and calculated as integer minor units.
- `amountMinor = quantity * unitPriceMinor`; clients cannot submit totals.
- Quote status is `PARTIAL` while empty and `COMPLETE` when at least one priced item exists.
- Each mutation requires `expectedRevision`; stale writes return `409 REVISION_CONFLICT`.

## Deferred

Authentication, organization scoping, rate cards, taxes, fractional quantities, FX, availability, review, snapshots, agent orchestration, and frontend integration remain later slices.

