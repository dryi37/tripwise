CREATE TYPE "SupplierOfferStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'INACTIVE');
CREATE TYPE "QuoteItemSourceType" AS ENUM ('CATALOG', 'MANUAL');
CREATE TYPE "QuoteItemPriceStatus" AS ENUM ('SOURCE', 'PRICE_OVERRIDDEN', 'MANUAL');
CREATE TYPE "IdempotencyState" AS ENUM ('IN_PROGRESS', 'SUCCEEDED', 'FAILED');

CREATE TABLE "suppliers" (
  "id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "normalized_name" VARCHAR(160) NOT NULL,
  "contact_name" VARCHAR(120),
  "phone" VARCHAR(40),
  "email" VARCHAR(254),
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "services" (
  "id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "category" VARCHAR(60) NOT NULL,
  "unit" VARCHAR(60) NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_offers" (
  "id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "unit_price_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "valid_from" DATE,
  "valid_until" DATE,
  "terms" TEXT,
  "status" "SupplierOfferStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "is_preferred" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "supplier_offers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "idempotency_records" (
  "id" UUID NOT NULL,
  "key" VARCHAR(200) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "state" "IdempotencyState" NOT NULL DEFAULT 'IN_PROGRESS',
  "status_code" INTEGER,
  "response_body" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quote_items"
  ADD COLUMN "service_id" UUID,
  ADD COLUMN "supplier_offer_id" UUID,
  ADD COLUMN "source_type" "QuoteItemSourceType" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "source_status" "SupplierOfferStatus",
  ADD COLUMN "price_status" "QuoteItemPriceStatus" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "supplier_name_snapshot" VARCHAR(160),
  ADD COLUMN "service_name_snapshot" VARCHAR(160),
  ADD COLUMN "source_unit_price_minor" BIGINT,
  ADD COLUMN "terms_snapshot" TEXT,
  ADD COLUMN "valid_until_snapshot" DATE;

CREATE UNIQUE INDEX "suppliers_normalized_name_key" ON "suppliers"("normalized_name");
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");
CREATE INDEX "services_category_is_active_idx" ON "services"("category", "is_active");
CREATE INDEX "services_name_idx" ON "services"("name");
CREATE INDEX "supplier_offers_service_id_status_idx" ON "supplier_offers"("service_id", "status");
CREATE INDEX "supplier_offers_supplier_id_idx" ON "supplier_offers"("supplier_id");
CREATE UNIQUE INDEX "supplier_offers_one_preferred_per_service" ON "supplier_offers"("service_id") WHERE "is_preferred" = true;
CREATE UNIQUE INDEX "idempotency_records_key_key" ON "idempotency_records"("key");
CREATE INDEX "quote_items_service_id_idx" ON "quote_items"("service_id");
CREATE INDEX "quote_items_supplier_offer_id_idx" ON "quote_items"("supplier_offer_id");

ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_supplier_offer_id_fkey" FOREIGN KEY ("supplier_offer_id") REFERENCES "supplier_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
