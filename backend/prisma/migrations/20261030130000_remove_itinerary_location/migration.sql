-- Activity venues are now identified by Google Place ID; remove free-form venue text.
UPDATE "plan_versions" AS version
SET "snapshot" = jsonb_set(
  version."snapshot",
  '{draft,items}',
  COALESCE((
    SELECT jsonb_agg(activity.item - 'location' ORDER BY activity.ordinality)
    FROM jsonb_array_elements(version."snapshot" #> '{draft,items}') WITH ORDINALITY AS activity(item, ordinality)
  ), '[]'::jsonb),
  false
)
WHERE jsonb_typeof(version."snapshot" #> '{draft,items}') = 'array';

ALTER TABLE "itinerary_items" DROP COLUMN "location";
