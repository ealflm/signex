-- Collapse the versioned global catalog domain into a single LIVE Catalog
-- singleton (Magento-OSS style: edit-in-place, no draft/publish/release/rollback).
-- Forward-only. The live catalog CONTENT is preserved: CatalogDraft is renamed
-- to Catalog and its editable snapshot column is kept.

-- 1. Drop the release infrastructure (children first for FK order).
DROP TABLE "CatalogReleaseAssetRef";
DROP TABLE "CatalogPublishedPointer";
DROP TABLE "CatalogRelease";
DROP SEQUENCE IF EXISTS "catalog_release_version_seq";

-- 2. Collapse CatalogDraft -> Catalog (the live singleton).
ALTER TABLE "CatalogDraft" RENAME TO "Catalog";
ALTER TABLE "Catalog" RENAME COLUMN "draftSnapshot" TO "snapshot";
ALTER TABLE "Catalog" RENAME COLUMN "draftRevision" TO "revision";
ALTER TABLE "Catalog" DROP COLUMN "liveSnapshot";
ALTER TABLE "Catalog" DROP COLUMN "lastPublishedRevision";
ALTER TABLE "Catalog" DROP COLUMN "lastPublishedChecksum";
