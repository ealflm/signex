// apps/admin/app/lib/analytics.ts
import { apiServer } from "./api";
import type {
  OverviewResponse, TimeseriesPoint, TopPage, SourcesResponse,
  CatalogInsightsResponse, FunnelResponse,
} from "@signex/shared";

export interface AnalyticsRange { from: string; to: string; }

export interface AnalyticsData {
  overview: OverviewResponse;
  timeseries: TimeseriesPoint[];
  topPages: TopPage[];
  sources: SourcesResponse;
  catalog: CatalogInsightsResponse;
  funnel: FunnelResponse;
}

const ZERO_KPIS = { visitors: 0, sessions: 0, pageviews: 0, avgSessionSec: 0, bounceRate: 0, leads: 0, conversionRate: 0 };
const EMPTY_OVERVIEW: OverviewResponse = { current: ZERO_KPIS, previous: ZERO_KPIS };

/** Resolve a `?range=7|30|90` day preset to an explicit from/to window (UTC). */
export function rangeFromPreset(days: number): AnalyticsRange {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function getAnalyticsData(range: AnalyticsRange): Promise<AnalyticsData> {
  const qs = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
  const [overview, timeseries, topPages, sources, catalog, funnel] = await Promise.all([
    apiServer<OverviewResponse>(`/api/analytics/overview?${qs}`),
    apiServer<TimeseriesPoint[]>(`/api/analytics/timeseries?${qs}&metric=sessions&interval=day`),
    apiServer<TopPage[]>(`/api/analytics/top-pages?${qs}&limit=10`),
    apiServer<SourcesResponse>(`/api/analytics/sources?${qs}`),
    apiServer<CatalogInsightsResponse>(`/api/analytics/catalog?${qs}`),
    apiServer<FunnelResponse>(`/api/analytics/funnel?${qs}`),
  ]);
  return {
    overview: overview.ok ? overview.data : EMPTY_OVERVIEW,
    timeseries: timeseries.ok ? timeseries.data : [],
    topPages: topPages.ok ? topPages.data : [],
    sources: sources.ok ? sources.data : { channels: [], campaigns: [], referrers: [] },
    catalog: catalog.ok ? catalog.data : { categories: [], products: [], ctaClicks: 0 },
    funnel: funnel.ok ? funnel.data : { stages: [], attribution: [] },
  };
}
