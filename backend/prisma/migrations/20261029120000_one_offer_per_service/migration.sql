BEGIN;

CREATE TEMP TABLE "_service_offer_split" ON COMMIT DROP AS
WITH ranked_offers AS (
  SELECT
    offer."id" AS "offer_id",
    offer."service_id" AS "service_id",
    row_number() OVER (
      PARTITION BY offer."service_id"
      ORDER BY (offer."status" = 'VERIFIED') DESC, offer."updated_at" DESC, offer."id" ASC
    ) AS "position"
  FROM "supplier_offers" AS offer
)
SELECT
  ranked."offer_id",
  ranked."service_id",
  gen_random_uuid() AS "new_service_id"
FROM ranked_offers AS ranked
WHERE ranked."position" > 1;

INSERT INTO "services" (
  "id", "name", "category", "tags", "unit", "is_active", "created_at", "updated_at"
)
SELECT
  split."new_service_id", service."name", service."category", service."tags", service."unit",
  service."is_active", service."created_at", service."updated_at"
FROM "_service_offer_split" AS split
JOIN "services" AS service ON service."id" = split."service_id";

UPDATE "supplier_offers" AS offer
SET "service_id" = split."new_service_id"
FROM "_service_offer_split" AS split
WHERE offer."id" = split."offer_id";

UPDATE "quote_items" AS item
SET "service_id" = split."new_service_id"
FROM "_service_offer_split" AS split
WHERE item."supplier_offer_id" = split."offer_id";

UPDATE "plan_versions" AS version
SET "snapshot" = jsonb_set(
  version."snapshot",
  '{quote,items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN split."new_service_id" IS NULL THEN saved_item."value"
        ELSE jsonb_set(saved_item."value", '{serviceId}', to_jsonb(split."new_service_id"::text), true)
      END
      ORDER BY saved_item."ordinality"
    )
    FROM jsonb_array_elements(version."snapshot" #> '{quote,items}') WITH ORDINALITY AS saved_item("value", "ordinality")
    LEFT JOIN "_service_offer_split" AS split
      ON split."offer_id"::text = saved_item."value"->>'supplierOfferId'
  ),
  true
)
WHERE jsonb_typeof(version."snapshot" #> '{quote,items}') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(version."snapshot" #> '{quote,items}') AS saved_item("value")
    JOIN "_service_offer_split" AS split
      ON split."offer_id"::text = saved_item."value"->>'supplierOfferId'
  );

DROP INDEX "supplier_offers_service_id_status_idx";
CREATE INDEX "supplier_offers_status_idx" ON "supplier_offers"("status");
CREATE UNIQUE INDEX "supplier_offers_service_id_key" ON "supplier_offers"("service_id");

COMMIT;
