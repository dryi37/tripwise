# Catalog Offer Semantic Search

## Intent

Help Tripwise's agent find the right supplier offer for an activity from natural-language requests. Search and embeddings operate per supplier offer, since each provider can have different details, price, validity, and suitability.

## Data and behavior

- Remove `Service.description`; service identity is represented by name, category, and unit.
- Rename supplier-offer `terms` to `details` in the catalog domain and user interface. Keep quote-item `termsSnapshot` as an immutable historical snapshot.
- Build one embedding document per offer from service name/category/unit, supplier name, offer details, price/currency/unit, validity, and verification status.
- Store offer vectors in a dedicated Qdrant collection, separate from knowledge-document vectors.
- Re-index on service, offer, or supplier metadata changes; remove offers from search when inactive, unverified, or their service is inactive.
- Agent search uses semantic matches and resolves them against current database rows before returning candidates. Fall back to the existing keyword search if vector search is unavailable or has no useful matches.
- Preserve historical quote snapshots. During migration, append any existing service descriptions to linked offer details before dropping the service-description column.

## Non-goals

- Do not change public web search or the separate knowledge-base embedding flow.
- Do not automatically choose a supplier or claim that an unverified price is usable.
- Do not embed mutable itinerary or customer data.

## Design choice

Use one vector per supplier offer in a separate Qdrant collection, then hydrate matches from PostgreSQL. This keeps retrieval granular enough to choose among suppliers while ensuring returned prices/statuses are current. Existing keyword search remains as a recovery path.

## Verification

Cover offer-document composition, semantic hit hydration and ordering, lifecycle re-indexing, migration preservation/removal, API/UI field naming, and agent search use with regression tests.
