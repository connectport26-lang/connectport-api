-- AlterEnum
ALTER TYPE "RequestReferenceKind" ADD VALUE 'video';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "media" JSONB NOT NULL DEFAULT '[]';
