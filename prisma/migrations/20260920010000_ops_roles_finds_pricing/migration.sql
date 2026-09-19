-- Fee / find enums
CREATE TYPE "FeeMode" AS ENUM ('fixed', 'percent');
CREATE TYPE "FindMatchType" AS ENUM ('exact', 'alternative');
CREATE TYPE "FindStatus" AS ENUM ('draft', 'sent');
CREATE TYPE "FindMediaKind" AS ENUM ('image', 'video');

-- Roles
CREATE TABLE "Role" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "permissions" TEXT[],
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Role_slug_key" ON "Role"("slug");

INSERT INTO "Role" ("id", "name", "slug", "description", "permissions", "isSystem")
VALUES
  (
    'role_admin',
    'Admin',
    'admin',
    'Full console access',
    ARRAY[
      'queue.view','queue.claim','finds.submit','catalog.manage','customers.view',
      'agents.invite','roles.manage','pricing.manage','teams.manage','activity.view'
    ]::TEXT[],
    true
  ),
  (
    'role_agent',
    'Agent',
    'agent',
    'Queue and sourcing finds',
    ARRAY['queue.view','queue.claim','finds.submit','activity.view']::TEXT[],
    true
  );

-- OpsUser invite / role FK
ALTER TABLE "OpsUser" ALTER COLUMN "name" DROP NOT NULL;
ALTER TABLE "OpsUser" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "OpsUser" ADD COLUMN IF NOT EXISTS "roleId" TEXT;
ALTER TABLE "OpsUser" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OpsUser" ADD COLUMN IF NOT EXISTS "profileCompletedAt" TIMESTAMP(3);

UPDATE "OpsUser" SET "roleId" = 'role_admin' WHERE "role" = 'admin';
UPDATE "OpsUser" SET "roleId" = 'role_agent' WHERE "role" = 'agent' OR "roleId" IS NULL;
UPDATE "OpsUser" SET "profileCompletedAt" = CURRENT_TIMESTAMP WHERE "name" IS NOT NULL AND "profileCompletedAt" IS NULL;

ALTER TABLE "OpsUser" ADD CONSTRAINT "OpsUser_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "OpsUser_roleId_idx" ON "OpsUser"("roleId");

-- Pricing config singleton
CREATE TABLE "PricingConfig" (
  "id" TEXT NOT NULL,
  "shippingRatePerKg" DECIMAL(14,2) NOT NULL,
  "agentFeeMode" "FeeMode" NOT NULL DEFAULT 'percent',
  "agentFeeValue" DECIMAL(14,2) NOT NULL,
  "agentFeeMin" DECIMAL(14,2),
  "agentFeeMax" DECIMAL(14,2),
  "miscMode" "FeeMode" NOT NULL DEFAULT 'fixed',
  "miscValue" DECIMAL(14,2) NOT NULL,
  "miscMin" DECIMAL(14,2),
  "miscMax" DECIMAL(14,2),
  "profitMode" "FeeMode" NOT NULL DEFAULT 'percent',
  "profitValue" DECIMAL(14,2) NOT NULL,
  "profitMin" DECIMAL(14,2) NOT NULL,
  "profitMax" DECIMAL(14,2) NOT NULL,
  "serviceLabel" TEXT NOT NULL DEFAULT 'Service & logistics',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PricingConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PricingConfig" (
  "id", "shippingRatePerKg", "agentFeeMode", "agentFeeValue", "agentFeeMin", "agentFeeMax",
  "miscMode", "miscValue", "profitMode", "profitValue", "profitMin", "profitMax",
  "serviceLabel", "updatedAt"
) VALUES (
  'default', 4500, 'percent', 5, 2000, 50000,
  'fixed', 5000, 'percent', 8, 25000, 350000,
  'Service & logistics', CURRENT_TIMESTAMP
);

-- Product finds
CREATE TABLE "ProductFind" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "matchType" "FindMatchType" NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT NOT NULL,
  "supplierCost" DECIMAL(14,2) NOT NULL,
  "weightKg" DECIMAL(10,3) NOT NULL,
  "moq" INTEGER NOT NULL,
  "leadTime" TEXT NOT NULL,
  "status" "FindStatus" NOT NULL DEFAULT 'draft',
  "quoteId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductFind_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductFindMedia" (
  "id" TEXT NOT NULL,
  "findId" TEXT NOT NULL,
  "kind" "FindMediaKind" NOT NULL,
  "url" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductFindMedia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductFind_requestId_idx" ON "ProductFind"("requestId");
CREATE INDEX "ProductFind_agentId_idx" ON "ProductFind"("agentId");
CREATE INDEX "ProductFindMedia_findId_idx" ON "ProductFindMedia"("findId");

ALTER TABLE "ProductFind" ADD CONSTRAINT "ProductFind_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductFind" ADD CONSTRAINT "ProductFind_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "OpsUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductFindMedia" ADD CONSTRAINT "ProductFindMedia_findId_fkey"
  FOREIGN KEY ("findId") REFERENCES "ProductFind"("id") ON DELETE CASCADE ON UPDATE CASCADE;
