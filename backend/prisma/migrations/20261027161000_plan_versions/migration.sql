CREATE TABLE "plan_versions" (
  "id" UUID NOT NULL,
  "trip_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "revision" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "plan_versions_trip_id_created_at_id_idx" ON "plan_versions"("trip_id", "created_at", "id");
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
