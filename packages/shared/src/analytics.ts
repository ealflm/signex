// packages/shared/src/analytics.ts
// First-party analytics contract: the ingest payload (validated) + the read-model
// response shapes shared by apps/api (producer) and apps/admin (consumer).
import { z } from "zod";

export const EVENT_KINDS = [
  "page_view",
  "scroll",
  "cta_click",
  "outbound_click",
  "category_view",
  "product_view",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const CHANNELS = ["direct", "organic", "social", "referral", "paid", "email"] as const;
export type Channel = (typeof CHANNELS)[number];

/** The beacon payload the browser sends to POST /api/collect. Server derives
 *  channel/country/device/browser/os — the client never sends those. */
export const collectEventSchema = z.object({
  visitorId: z.string().min(1).max(64),
  sessionId: z.string().min(1).max(64),
  kind: z.enum(EVENT_KINDS),
  path: z.string().min(1).max(512),
  title: z.string().max(512).optional(),
  referrer: z.string().max(1024).optional(),
  utmSource: z.string().max(256).optional(),
  utmMedium: z.string().max(256).optional(),
  utmCampaign: z.string().max(256).optional(),
  utmTerm: z.string().max(256).optional(),
  utmContent: z.string().max(256).optional(),
  lang: z.string().max(8).optional(),
  catalogSlug: z.string().max(256).optional(),
  productSlug: z.string().max(256).optional(),
  meta: z.record(z.unknown()).optional(),
});
export type CollectEvent = z.infer<typeof collectEventSchema>;

// ===== Read-model response DTOs (server-generated; typed as interfaces) =====
export interface OverviewKpis {
  visitors: number;
  sessions: number;
  pageviews: number;
  avgSessionSec: number;
  bounceRate: number; // 0..1
  leads: number;
  conversionRate: number; // 0..1
}
export interface OverviewResponse {
  current: OverviewKpis;
  previous: OverviewKpis; // same-length window immediately before `from`
}
export interface TimeseriesPoint {
  bucket: string; // ISO day or hour
  value: number;
}
export interface TopPage {
  path: string;
  pageviews: number;
  visitors: number;
}
export interface ChannelStat {
  channel: Channel;
  sessions: number;
  leads: number;
}
export interface CampaignStat {
  campaign: string;
  sessions: number;
  leads: number;
}
export interface ReferrerStat {
  referrer: string;
  sessions: number;
}
export interface SourcesResponse {
  channels: ChannelStat[];
  campaigns: CampaignStat[];
  referrers: ReferrerStat[];
}
export interface CatalogStat {
  slug: string;
  views: number;
  visitors: number;
}
export interface CatalogInsightsResponse {
  categories: CatalogStat[];
  products: CatalogStat[];
  ctaClicks: number;
}
export interface FunnelStage {
  stage: string;
  count: number;
  pct: number; // 0..1 of the first stage
}
export interface AttributionRow {
  key: string; // channel or entry path
  leads: number;
}
export interface FunnelResponse {
  stages: FunnelStage[];
  attribution: AttributionRow[];
}
export interface RealtimeEvent {
  kind: EventKind | "lead";
  path: string;
  occurredAt: string;
}
export interface RealtimeResponse {
  activeVisitors: number;
  perMinute: TimeseriesPoint[]; // last 30 one-minute buckets
  topPages: TopPage[];
  recent: RealtimeEvent[];
}
