CREATE TYPE "ExternalVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'REJECTED');
ALTER TYPE "QuoteItemSourceType" ADD VALUE 'EXTERNAL';
CREATE TABLE "external_sources" (
  "id" UUID NOT NULL, "trip_id" UUID NOT NULL, "result_key" VARCHAR(240) NOT NULL,
  "place_name" VARCHAR(200) NOT NULL, "publisher" VARCHAR(200) NOT NULL, "domain" VARCHAR(200) NOT NULL,
  "canonical_url" TEXT NOT NULL, "title" VARCHAR(300) NOT NULL, "excerpt" TEXT NOT NULL,
  "retrieved_at" TIMESTAMPTZ(3) NOT NULL, "original_amount_minor" BIGINT NOT NULL,
  "original_currency" CHAR(3) NOT NULL, "pricing_unit" VARCHAR(60) NOT NULL, "audience" VARCHAR(60) NOT NULL,
  "suitable" BOOLEAN NOT NULL, "confidence" DOUBLE PRECISION NOT NULL,
  "verification_status" "ExternalVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED', "evidence" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "external_sources_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_sources_trip_id_canonical_url_key" ON "external_sources"("trip_id", "canonical_url");
CREATE INDEX "external_sources_trip_id_created_at_idx" ON "external_sources"("trip_id", "created_at");
ALTER TABLE "external_sources" ADD CONSTRAINT "external_sources_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE;
ALTER TABLE "itinerary_items" ADD COLUMN "external_source_id" UUID;
ALTER TABLE "quote_items" ADD COLUMN "external_source_id" UUID;
CREATE INDEX "itinerary_items_external_source_id_idx" ON "itinerary_items"("external_source_id");
CREATE INDEX "quote_items_external_source_id_idx" ON "quote_items"("external_source_id");
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_external_source_id_fkey" FOREIGN KEY ("external_source_id") REFERENCES "external_sources"("id") ON DELETE SET NULL;
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_external_source_id_fkey" FOREIGN KEY ("external_source_id") REFERENCES "external_sources"("id") ON DELETE SET NULL;
