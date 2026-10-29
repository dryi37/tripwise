-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'REVIEWED');

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "customer_name" VARCHAR(120) NOT NULL,
    "origin" VARCHAR(120) NOT NULL,
    "destination" VARCHAR(120) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "travelers" INTEGER NOT NULL,
    "budget_amount_minor" BIGINT NOT NULL,
    "budget_currency" CHAR(3) NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trips_updated_at_id_idx" ON "trips"("updated_at", "id");

-- CreateIndex
CREATE INDEX "trips_status_updated_at_idx" ON "trips"("status", "updated_at");
