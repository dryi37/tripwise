ALTER TABLE "itinerary_items" ADD COLUMN "supplier_offer_id" UUID;

CREATE INDEX "itinerary_items_supplier_offer_id_idx" ON "itinerary_items"("supplier_offer_id");

ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_supplier_offer_id_fkey"
FOREIGN KEY ("supplier_offer_id") REFERENCES "supplier_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
