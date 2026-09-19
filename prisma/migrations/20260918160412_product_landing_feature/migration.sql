-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "featuredOnLanding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "landingSort" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Product_featuredOnLanding_landingSort_idx" ON "Product"("featuredOnLanding", "landingSort");
