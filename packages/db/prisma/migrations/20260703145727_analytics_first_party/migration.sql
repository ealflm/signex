-- AlterTable
ALTER TABLE "Catalog" RENAME CONSTRAINT "CatalogDraft_pkey" TO "Catalog_pkey";

-- AlterTable
ALTER TABLE "FormSubmission" ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "visitorId" TEXT;

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "channel" TEXT NOT NULL,
    "country" TEXT,
    "device" TEXT NOT NULL,
    "browser" TEXT,
    "os" TEXT,
    "lang" TEXT,
    "catalogSlug" TEXT,
    "productSlug" TEXT,
    "meta" JSONB,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSession" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "entryPath" TEXT NOT NULL,
    "exitPath" TEXT,
    "referrer" TEXT,
    "channel" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "country" TEXT,
    "device" TEXT NOT NULL,
    "browser" TEXT,
    "os" TEXT,
    "lang" TEXT,
    "pageviews" INTEGER NOT NULL DEFAULT 0,
    "eventsCount" INTEGER NOT NULL DEFAULT 0,
    "bounced" BOOLEAN NOT NULL DEFAULT true,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "converted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AnalyticsSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_occurredAt_idx" ON "AnalyticsEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_kind_occurredAt_idx" ON "AnalyticsEvent"("kind", "occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_sessionId_idx" ON "AnalyticsEvent"("sessionId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_visitorId_idx" ON "AnalyticsEvent"("visitorId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_catalogSlug_idx" ON "AnalyticsEvent"("catalogSlug");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_productSlug_idx" ON "AnalyticsEvent"("productSlug");

-- CreateIndex
CREATE INDEX "AnalyticsSession_startedAt_idx" ON "AnalyticsSession"("startedAt");

-- CreateIndex
CREATE INDEX "AnalyticsSession_visitorId_idx" ON "AnalyticsSession"("visitorId");

-- CreateIndex
CREATE INDEX "AnalyticsSession_channel_idx" ON "AnalyticsSession"("channel");

-- CreateIndex
CREATE INDEX "AnalyticsSession_converted_idx" ON "AnalyticsSession"("converted");

-- CreateIndex
CREATE INDEX "FormSubmission_sessionId_idx" ON "FormSubmission"("sessionId");

-- RenameForeignKey
ALTER TABLE "Catalog" RENAME CONSTRAINT "CatalogDraft_updatedById_fkey" TO "Catalog_updatedById_fkey";
