-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('draft', 'verified', 'published', 'archived');

-- CreateEnum
CREATE TYPE "ProductAvailability" AS ENUM ('in_stock', 'made_to_order', 'limited');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "moq" INTEGER NOT NULL,
    "weightKg" DECIMAL(10,3) NOT NULL,
    "estimatedDeliveryDays" INTEGER NOT NULL,
    "availability" "ProductAvailability" NOT NULL DEFAULT 'made_to_order',
    "status" "ProductStatus" NOT NULL DEFAULT 'draft',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "sourceRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");
