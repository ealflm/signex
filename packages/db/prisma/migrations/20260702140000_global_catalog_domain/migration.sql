-- Global catalog domain: catalog gets its own draft → publish → rollback
-- lifecycle, independent of themes/content. Mirrors the content release
-- machinery (Theme + Release + PublishedPointer + ReleaseAssetRef) but scoped
-- to a single GLOBAL catalog. Purely additive (new tables + one sequence);
-- no existing table is touched, so this is a forward-only, non-destructive
-- migration safe under `prisma migrate deploy`.

-- CreateTable
CREATE TABLE "CatalogDraft" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "draftSnapshot" JSONB NOT NULL,
    "liveSnapshot" JSONB,
    "draftRevision" INTEGER NOT NULL DEFAULT 0,
    "lastPublishedRevision" INTEGER NOT NULL DEFAULT 0,
    "lastPublishedChecksum" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogRelease" (
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

    CONSTRAINT "CatalogRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogPublishedPointer" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "releaseId" TEXT NOT NULL,
    "publishedVersion" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT NOT NULL,

    CONSTRAINT "CatalogPublishedPointer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogReleaseAssetRef" (
    "releaseId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "CatalogReleaseAssetRef_pkey" PRIMARY KEY ("releaseId","assetId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogRelease_version_key" ON "CatalogRelease"("version");

-- CreateIndex
CREATE INDEX "CatalogRelease_status_idx" ON "CatalogRelease"("status");

-- CreateIndex
CREATE INDEX "CatalogRelease_version_idx" ON "CatalogRelease"("version");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPublishedPointer_releaseId_key" ON "CatalogPublishedPointer"("releaseId");

-- CreateIndex
CREATE INDEX "CatalogReleaseAssetRef_assetId_idx" ON "CatalogReleaseAssetRef"("assetId");

-- AddForeignKey
ALTER TABLE "CatalogDraft" ADD CONSTRAINT "CatalogDraft_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogRelease" ADD CONSTRAINT "CatalogRelease_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogRelease" ADD CONSTRAINT "CatalogRelease_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPublishedPointer" ADD CONSTRAINT "CatalogPublishedPointer_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "CatalogRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogReleaseAssetRef" ADD CONSTRAINT "CatalogReleaseAssetRef_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "CatalogRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogReleaseAssetRef" ADD CONSTRAINT "CatalogReleaseAssetRef_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateSequence: catalog release version counter (mirrors release_version_seq).
-- CatalogRelease.version is assigned from nextval('catalog_release_version_seq')
-- by CatalogReleaseService at publish time (parallels the content release engine).
CREATE SEQUENCE "catalog_release_version_seq";
