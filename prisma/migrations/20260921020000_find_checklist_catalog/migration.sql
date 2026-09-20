-- AlterTable
ALTER TABLE "ProductFind" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProductFind" ADD COLUMN "variations" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ProductFind" ADD COLUMN "productId" TEXT;

-- CreateIndex
CREATE INDEX "ProductFind_productId_idx" ON "ProductFind"("productId");
