CREATE TABLE IF NOT EXISTS "OpsAuditLog" (
    "id" TEXT NOT NULL,
    "opsUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpsAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OpsAuditLog_opsUserId_idx" ON "OpsAuditLog"("opsUserId");
CREATE INDEX IF NOT EXISTS "OpsAuditLog_entityId_idx" ON "OpsAuditLog"("entityId");
CREATE INDEX IF NOT EXISTS "OpsAuditLog_createdAt_idx" ON "OpsAuditLog"("createdAt");
