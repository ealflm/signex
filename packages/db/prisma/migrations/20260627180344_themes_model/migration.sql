-- DropForeignKey
ALTER TABLE "AssetRef" DROP CONSTRAINT "AssetRef_assetId_fkey";

-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_imageId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_imageId_fkey";

-- AlterTable
ALTER TABLE "Release" ADD COLUMN     "themeId" TEXT;

-- DropTable
DROP TABLE "AssetRef";

-- DropTable
DROP TABLE "Category";

-- DropTable
DROP TABLE "ContentBlock";

-- DropTable
DROP TABLE "Product";

-- DropTable
DROP TABLE "WorkingState";

-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "draftSnapshot" JSONB NOT NULL,
    "liveSnapshot" JSONB,
    "draftRevision" INTEGER NOT NULL DEFAULT 0,
    "lastPublishedRevision" INTEGER NOT NULL DEFAULT 0,
    "lastPublishedChecksum" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Theme_name_key" ON "Theme"("name");

-- CreateIndex
CREATE INDEX "Theme_updatedAt_idx" ON "Theme"("updatedAt");

-- CreateIndex
CREATE INDEX "Release_themeId_idx" ON "Release"("themeId");

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Theme" ADD CONSTRAINT "Theme_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

