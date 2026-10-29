ALTER TABLE "supplier_offers" RENAME COLUMN "terms" TO "details";

UPDATE "supplier_offers" AS offer
SET "details" = concat_ws(E'\n\n', NULLIF(offer."details", ''), NULLIF(service."description", ''))
FROM "services" AS service
WHERE service."id" = offer."service_id"
  AND NULLIF(service."description", '') IS NOT NULL;

ALTER TABLE "services" DROP COLUMN "description";
