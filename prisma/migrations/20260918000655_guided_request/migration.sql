-- CreateEnum
CREATE TYPE "BudgetScope" AS ENUM ('per_unit', 'total');

-- CreateEnum
CREATE TYPE "NeedByKind" AS ENUM ('specific_date', 'timeframe', 'flexible');

-- CreateEnum
CREATE TYPE "RequestReferenceKind" AS ENUM ('link', 'image');

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "budgetScope" "BudgetScope",
ADD COLUMN     "needByDate" TIMESTAMP(3),
ADD COLUMN     "needByKind" "NeedByKind",
ADD COLUMN     "needByTimeframe" TEXT,
ADD COLUMN     "productDescription" TEXT,
ADD COLUMN     "productName" TEXT;

-- CreateTable
CREATE TABLE "RequestReference" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" "RequestReferenceKind" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestReference_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RequestReference" ADD CONSTRAINT "RequestReference_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
