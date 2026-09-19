-- Find review statuses
ALTER TYPE "FindStatus" ADD VALUE IF NOT EXISTS 'pending_review';
ALTER TYPE "FindStatus" ADD VALUE IF NOT EXISTS 'rejected';

-- Review metadata on ProductFind
ALTER TABLE "ProductFind" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "ProductFind" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "ProductFind" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;

DO $$ BEGIN
  ALTER TABLE "ProductFind"
    ADD CONSTRAINT "ProductFind_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "OpsUser"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ProductFind_reviewedById_idx" ON "ProductFind"("reviewedById");

-- Grant finds.approve to Admin system role
UPDATE "Role"
SET "permissions" = ARRAY[
  'queue.view','queue.claim','finds.submit','finds.approve','catalog.manage','customers.view',
  'agents.invite','roles.manage','pricing.manage','teams.manage','activity.view'
]::TEXT[]
WHERE "slug" = 'admin';
