-- Viral-scale indexes + unique payment gatewayRef
CREATE INDEX IF NOT EXISTS "Request_userId_idx" ON "Request"("userId");
CREATE INDEX IF NOT EXISTS "Request_status_idx" ON "Request"("status");
CREATE INDEX IF NOT EXISTS "Request_createdAt_idx" ON "Request"("createdAt");
CREATE INDEX IF NOT EXISTS "Request_assignedOpsUserId_idx" ON "Request"("assignedOpsUserId");
CREATE INDEX IF NOT EXISTS "Quote_requestId_idx" ON "Quote"("requestId");
CREATE INDEX IF NOT EXISTS "Quote_supplierRef_idx" ON "Quote"("supplierRef");
CREATE INDEX IF NOT EXISTS "StatusUpdate_requestId_idx" ON "StatusUpdate"("requestId");
CREATE INDEX IF NOT EXISTS "StatusUpdate_createdAt_idx" ON "StatusUpdate"("createdAt");
CREATE INDEX IF NOT EXISTS "Notification_requestId_idx" ON "Notification"("requestId");
CREATE INDEX IF NOT EXISTS "RequestReference_requestId_idx" ON "RequestReference"("requestId");
CREATE INDEX IF NOT EXISTS "EmailOtp_expiresAt_idx" ON "EmailOtp"("expiresAt");

-- Unique gatewayRef (dedupe duplicate refs before applying if needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Payment_gatewayRef_key'
  ) THEN
    CREATE UNIQUE INDEX "Payment_gatewayRef_key" ON "Payment"("gatewayRef");
  END IF;
END $$;
ALTER TABLE "Credential" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
