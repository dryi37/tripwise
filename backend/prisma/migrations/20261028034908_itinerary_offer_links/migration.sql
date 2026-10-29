-- DropForeignKey
ALTER TABLE "external_sources" DROP CONSTRAINT "external_sources_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_items" DROP CONSTRAINT "itinerary_items_external_source_id_fkey";

-- DropForeignKey
ALTER TABLE "quote_items" DROP CONSTRAINT "quote_items_external_source_id_fkey";

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_external_source_id_fkey" FOREIGN KEY ("external_source_id") REFERENCES "external_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_external_source_id_fkey" FOREIGN KEY ("external_source_id") REFERENCES "external_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_sources" ADD CONSTRAINT "external_sources_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
