ALTER TYPE "QuoteItemPriceStatus" ADD VALUE 'NEEDS_REVIEW';

ALTER TABLE "quote_items" ADD COLUMN "itinerary_item_id" UUID;
CREATE UNIQUE INDEX "quote_items_itinerary_item_id_key" ON "quote_items"("itinerary_item_id");
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_itinerary_item_id_fkey"
FOREIGN KEY ("itinerary_item_id") REFERENCES "itinerary_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
