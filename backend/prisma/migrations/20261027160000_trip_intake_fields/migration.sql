ALTER TABLE "trips"
  ADD COLUMN "adult_count" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "child_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "customer_request" TEXT,
  ADD COLUMN "planning_started" BOOLEAN NOT NULL DEFAULT false;

UPDATE "trips" SET "adult_count" = "travelers", "child_count" = 0;
