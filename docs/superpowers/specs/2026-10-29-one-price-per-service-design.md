# One Price Per Service

## Intent

The catalog screen and agent should treat a service as one catalog row with at most one unit price. Today `Service` has many `SupplierOffer` rows, which lets the database and API represent multiple prices for one service and makes the flat catalog render multiple rows for that service.

## Goals

- Enforce at most one price record for each service in PostgreSQL and Prisma.
- Reject creation of a second price for a service with a clear `409` API error; editing its existing price remains supported.
- Preserve existing offer IDs so itinerary items and quote rows keep their source links.
- Preserve every existing price by splitting each service with multiple prices into separate service records during migration.
- Model the relation as a singular optional price in Prisma and backend internals; serialize the existing `offers` array only at the API/agent boundary for compatibility.
- Keep only verified prices eligible for agent search and Qdrant indexing.
- Configure the result count for each agent search tool independently through the required backend environment variable `AGENT_SEARCH_RESULTS_PER_TOOL` (example value: `5`). The model does not receive or send a result-limit parameter; each search service owns its configured result count.

## Non-goals

- Do not merge or discard existing prices.
- Do not redesign quote snapshots or external web-source pricing.
- Do not change the catalog screen's visual style beyond ensuring one service produces at most one price row.

## Approaches

1. **Keep `SupplierOffer`, enforce one-to-one with a unique `serviceId`, and split existing duplicates into service rows.** This preserves stable offer IDs and quote links, keeps current API consumers working, and makes PostgreSQL reject duplicates even during concurrent requests. This is the selected approach.
2. **Move price fields directly onto `Service` and remove `SupplierOffer`.** This is a more literal data model but requires rewriting quote and itinerary source relations and migrating stable offer IDs, with more risk to history.

## Data migration

- For every service with multiple offer rows, retain the existing service ID for a deterministic offer (verified first, then newest `updatedAt`, then offer ID ascending).
- Create a cloned service record for each remaining offer, preserving service name, category, tags, unit, active state, and timestamps; give each clone a new UUID.
- Reassign each additional offer to its cloned service without changing the offer ID.
- Update `QuoteItem.serviceId` for rows whose `supplierOfferId` was reassigned, so quote rows keep consistent service and offer references.
- Add a unique index on `supplier_offers.service_id` after the split.
- Migration must be transactional and preserve existing quote and itinerary references.

## API and agent behavior

- `POST /catalog/services/:serviceId/offers` checks for an existing offer and returns `409 SERVICE_PRICE_EXISTS` if one already exists. The unique database constraint remains the final concurrency guard and its violation maps to the same API error.
- The existing offer update route updates the single price record.
- Service search returns no more than one verified offer per service; Qdrant indexes no more than one verified offer per service.
- Prisma and backend repository types use a singular optional `offer`; the HTTP catalog response and agent tool result retain `offers: []` or `offers: [oneOffer]` during this change for compatibility.
- Agent web, knowledge, and catalog search services read the required `AGENT_SEARCH_RESULTS_PER_TOOL` backend setting. Tool schemas accept only search terms/category, never result counts.

## Verification

- Unit and API tests cover duplicate price rejection, updating the existing price, concurrent/constraint conflict mapping, and one offer per service in list/search responses.
- Agent tool tests verify result counts are controlled by backend configuration and the model cannot supply a result limit.
- Migration SQL is checked against duplicate services, quote rows linked by both IDs, and services with no offers.
- Run Prisma validation/generation, backend typecheck, focused tests, full backend suite, and the catalog frontend QA/syntax checks.

## Builder decisions

- Use a PostgreSQL unique index on `supplier_offers.service_id`; keep historical and source IDs intact.
- Model `Service.offer` as optional singular in Prisma and `ServiceRecord.offer` internally; convert to a singleton/empty `offers` array at existing consumer boundaries.
- Keep service rows that have no offer valid for now; the database enforces *at most* one price, while the current UI creates the price immediately after creating a service.
- Existing duplicate prices become separate catalog service rows, using the deterministic selection above for the original service ID.
