-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EDITOR', 'PUBLISHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING', 'READY');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'VIDEO', 'SVG');

-- CreateEnum
CREATE TYPE "BlockKind" AS ENUM ('PAGE', 'SETTINGS', 'NAV', 'SEO');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('NEW', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EDITOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
    "kind" "AssetKind" NOT NULL,
    "sha256" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration" DOUBLE PRECISION,
    "originalName" TEXT NOT NULL,
    "altDefault" JSONB,
    "posterId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetRef" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "alt" JSONB,

    CONSTRAINT "AssetRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseAssetRef" (
    "releaseId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "ReleaseAssetRef_pkey" PRIMARY KEY ("releaseId","assetId")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" JSONB NOT NULL,
    "tag" JSONB NOT NULL,
    "intro" JSONB NOT NULL,
    "productCount" INTEGER NOT NULL,
    "materialCount" INTEGER NOT NULL,
    "imageId" TEXT,
    "imageAlt" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" JSONB NOT NULL,
    "tag" JSONB NOT NULL,
    "desc" JSONB NOT NULL,
    "imageId" TEXT,
    "imageAlt" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentBlock" (
    "id" TEXT NOT NULL,
    "kind" "BlockKind" NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "formKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "uploadAssetId" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'NEW',
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'PUBLISHED',
    "label" TEXT,
    "note" TEXT,
    "snapshot" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "fromRevision" INTEGER NOT NULL,
    "rolledBackFromVersion" INTEGER,
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedPointer" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "releaseId" TEXT NOT NULL,
    "publishedVersion" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT NOT NULL,

    CONSTRAINT "PublishedPointer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingState" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "lastPublishedRevision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "WorkingState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_sha256_key" ON "Asset"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_r2Key_key" ON "Asset"("r2Key");

-- CreateIndex
CREATE INDEX "Asset_status_kind_idx" ON "Asset"("status", "kind");

-- CreateIndex
CREATE INDEX "Asset_deletedAt_idx" ON "Asset"("deletedAt");

-- CreateIndex
CREATE INDEX "AssetRef_assetId_idx" ON "AssetRef"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetRef_ownerType_ownerId_field_key" ON "AssetRef"("ownerType", "ownerId", "field");

-- CreateIndex
CREATE INDEX "ReleaseAssetRef_assetId_idx" ON "ReleaseAssetRef"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_sortOrder_idx" ON "Category"("sortOrder");

-- CreateIndex
CREATE INDEX "Product_categoryId_sortOrder_idx" ON "Product"("categoryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Product_categoryId_slug_key" ON "Product"("categoryId", "slug");

-- CreateIndex
CREATE INDEX "ContentBlock_kind_idx" ON "ContentBlock"("kind");

-- CreateIndex
CREATE INDEX "ContentBlock_key_idx" ON "ContentBlock"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ContentBlock_kind_key_key" ON "ContentBlock"("kind", "key");

-- CreateIndex
CREATE INDEX "FormSubmission_formKey_status_idx" ON "FormSubmission"("formKey", "status");

-- CreateIndex
CREATE INDEX "FormSubmission_createdAt_idx" ON "FormSubmission"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Release_version_key" ON "Release"("version");

-- CreateIndex
CREATE INDEX "Release_status_idx" ON "Release"("status");

-- CreateIndex
CREATE INDEX "Release_version_idx" ON "Release"("version");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedPointer_releaseId_key" ON "PublishedPointer"("releaseId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRef" ADD CONSTRAINT "AssetRef_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseAssetRef" ADD CONSTRAINT "ReleaseAssetRef_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseAssetRef" ADD CONSTRAINT "ReleaseAssetRef_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedPointer" ADD CONSTRAINT "PublishedPointer_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Postgres sequence for monotonic, collision-free Release.version (Prisma does not model sequences)
CREATE SEQUENCE "release_version_seq";
