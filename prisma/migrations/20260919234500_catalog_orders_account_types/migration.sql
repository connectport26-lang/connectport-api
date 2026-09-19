-- AccountType: replace individual with personal + starting_business
CREATE TYPE "AccountType_new" AS ENUM ('personal', 'starting_business', 'business');

ALTER TABLE "User"
  ALTER COLUMN "accountType" TYPE "AccountType_new"
  USING (
    CASE
      WHEN "accountType"::text = 'individual' THEN 'personal'::"AccountType_new"
      WHEN "accountType"::text = 'business' THEN 'business'::"AccountType_new"
      ELSE 'personal'::"AccountType_new"
    END
  );

DROP TYPE "AccountType";
ALTER TYPE "AccountType_new" RENAME TO "AccountType";

-- Request channel + cancel reason
CREATE TYPE "RequestChannel" AS ENUM ('sourcing', 'catalog');
CREATE TYPE "CancelReason" AS ENUM ('out_of_stock', 'customer_request', 'other');

ALTER TABLE "Request"
  ADD COLUMN IF NOT EXISTS "channel" "RequestChannel" NOT NULL DEFAULT 'sourcing',
  ADD COLUMN IF NOT EXISTS "cancelReason" "CancelReason",
  ADD COLUMN IF NOT EXISTS "cancelNote" TEXT;

CREATE INDEX IF NOT EXISTS "Request_channel_idx" ON "Request"("channel");

-- Status enums (IF NOT EXISTS for idempotent deploys)
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'refunded';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'refund_pending';

-- Payment refund fields
ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "refundRef" TEXT,
  ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
