-- Supplier names are no longer part of catalog prices or quote items.
-- Keep service, price, itinerary, and quote IDs intact for historical references.
ALTER TABLE "supplier_offers" DROP CONSTRAINT "supplier_offers_supplier_id_fkey";
DROP INDEX "supplier_offers_supplier_id_idx";
ALTER TABLE "supplier_offers" DROP COLUMN "supplier_id";
ALTER TABLE "quote_items" DROP COLUMN "supplier_name_snapshot";
DROP TABLE "suppliers";
