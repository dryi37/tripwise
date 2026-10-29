-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PARTIAL', 'COMPLETE');

-- CreateTable
CREATE TABLE "itinerary_drafts" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "itinerary_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_items" (
    "id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "day_index" INTEGER NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "location" VARCHAR(200) NOT NULL,
    "local_start_time" VARCHAR(5) NOT NULL,
    "local_end_time" VARCHAR(5) NOT NULL,
    "timezone" VARCHAR(80) NOT NULL,
    "description" TEXT NOT NULL,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "itinerary_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PARTIAL',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "total_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "unit" VARCHAR(60) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_minor" BIGINT NOT NULL,
    "amount_minor" BIGINT NOT NULL,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "itinerary_drafts_trip_id_key" ON "itinerary_drafts"("trip_id");

-- CreateIndex
CREATE INDEX "itinerary_items_draft_id_day_index_local_start_time_idx" ON "itinerary_items"("draft_id", "day_index", "local_start_time");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_trip_id_key" ON "quotes"("trip_id");

-- CreateIndex
CREATE INDEX "quote_items_quote_id_idx" ON "quote_items"("quote_id");

-- AddForeignKey
ALTER TABLE "itinerary_drafts" ADD CONSTRAINT "itinerary_drafts_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "itinerary_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
