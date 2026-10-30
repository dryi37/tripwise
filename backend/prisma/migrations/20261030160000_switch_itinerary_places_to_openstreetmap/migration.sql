ALTER TABLE "itinerary_items"
  ADD COLUMN "place_provider" VARCHAR(32),
  ADD COLUMN "place_id" VARCHAR(255),
  ADD COLUMN "place_name" TEXT,
  ADD COLUMN "place_address" TEXT,
  ADD COLUMN "place_latitude" DOUBLE PRECISION,
  ADD COLUMN "place_longitude" DOUBLE PRECISION;

-- Preserve old Google IDs for history, but mark them as legacy so the OSM map never treats them as OSM IDs.
UPDATE "itinerary_items"
SET "place_provider" = 'GOOGLE_LEGACY', "place_id" = "google_place_id"
WHERE "google_place_id" IS NOT NULL;

-- Rewrite saved snapshots to the provider-neutral contract while retaining legacy IDs for manual reselection.
UPDATE "plan_versions" AS version
SET "snapshot" = jsonb_set(
  version."snapshot",
  '{draft,items}',
  COALESCE((
    SELECT jsonb_agg(
      (activity.item - 'googlePlaceId') ||
      CASE
        WHEN activity.item ? 'googlePlaceId' AND activity.item->>'googlePlaceId' IS NOT NULL
          THEN jsonb_build_object('placeProvider', 'GOOGLE_LEGACY', 'placeId', activity.item->>'googlePlaceId')
        ELSE '{}'::jsonb
      END
      ORDER BY activity.ordinality
    )
    FROM jsonb_array_elements(version."snapshot" #> '{draft,items}') WITH ORDINALITY AS activity(item, ordinality)
  ), '[]'::jsonb),
  false
)
WHERE jsonb_typeof(version."snapshot" #> '{draft,items}') = 'array';

ALTER TABLE "itinerary_items" DROP COLUMN "google_place_id";
