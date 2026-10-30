ALTER TYPE "ExternalVerificationStatus" RENAME TO "ExternalVerificationStatus_old";
CREATE TYPE "ExternalVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED');

ALTER TABLE "external_sources" ALTER COLUMN "verification_status" DROP DEFAULT;
ALTER TABLE "external_sources"
  ALTER COLUMN "verification_status" TYPE "ExternalVerificationStatus"
  USING (
    CASE
      WHEN "verification_status"::text = 'REJECTED' THEN 'UNVERIFIED'
      ELSE "verification_status"::text
    END
  )::"ExternalVerificationStatus";
ALTER TABLE "external_sources"
  ALTER COLUMN "verification_status" SET DEFAULT 'UNVERIFIED';

DROP TYPE "ExternalVerificationStatus_old";
