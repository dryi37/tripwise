# Supplier Offers Design

## Intent

Replace the misleading one-price-per-service catalog with a provider-aware workspace. Consultants compare supplier offers, explicitly select one, and copy a snapshot into the current trip quote.

## Approved approach

Group rows by service because the working question starts with a need (flight, hotel, vehicle), then show each supplier offer beneath it. A flat offer table was rejected because repeated service metadata makes comparison noisy; retaining one price was rejected because it cannot represent the business.

## Domain rules

- A service has a name, category, and unit but no authoritative price.
- A supplier offer has provider, price, validity date, terms, verification status, and preferred state.
- Multiple offers may exist for one service; exactly one may be preferred in a service group.
- Applying prices copies the preferred offer into the current trip quote as a snapshot. Later catalog edits never silently modify that trip.
- Missing, expired, or unverified offers remain visibly distinguishable. This prototype does not imply availability or booking.
- Existing browser-local data is migrated without loss by turning each legacy rate into one internal legacy offer.

## UI

Rename the navigation and page to **Nguồn cung & báo giá**. Each service group shows its category and unit, then supplier rows with provider, price, validity, status, terms, and a radio-like preferred action. Create/edit uses the existing accessible modal/form/toast patterns. The page keeps URL-backed local search and an explicit apply action.

## Verification

Cover migration, multiple offers, preferred selection, snapshot application, expired/unverified presentation, search, desktop/mobile layout, keyboard focus, and no regressions to the quote total.
