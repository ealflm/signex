/**
 * Server-only aggregator for the admin Overview dashboard.
 * Calls multiple api endpoints concurrently; each sub-fetch degrades
 * gracefully — a failed fetch returns a zeroed fallback, never throws.
 *
 * Usage (server component or server action):
 *   import { getOverviewData } from "@/app/lib/overview";
 *   const data = await getOverviewData(30);
 */
import { apiServer } from "./api";

// ── API response shapes ──────────────────────────────────────────────────────

interface FormsSummaryResponse {
  total: number;
  new: number;
  byKey: { quote: number; contact: number };
  series: Array<{ date: string; count: number }>;
}

interface FormsListResponse {
  items: Array<{
    id: string;
    formKey: string;
    status: string;
    payload: unknown;
    ip: string | null;
    userAgent: string | null;
    createdAt: string;
    hasUpload: boolean;
  }>;
  total: number;
}

interface CatalogItem {
  id: string;
}

interface DiffResponse {
  dirty: boolean;
  revision: number;
  lastPublishedRevision: number;
}

interface LiveResponse {
  version: number;
  checksum: string;
  publishedAt: string;
}

interface AssetItem {
  id: string;
}

// ── Public output shapes ─────────────────────────────────────────────────────

export interface LeadSeries {
  date: string;
  count: number;
}

export interface LeadData {
  total: number;
  new: number;
  /** % change vs previous period; null if baseline is 0 */
  deltaPct: number | null;
  series: LeadSeries[];
}

export interface CatalogData {
  products: number;
  categories: number;
}

export interface MediaData {
  assets: number;
}

export interface ReleaseData {
  liveVersion: number | null;
  dirty: boolean;
  workingRevision: number;
  lastPublishedRevision: number;
}

export interface RecentLead {
  id: string;
  formKey: string;
  status: string;
  payload: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  hasUpload: boolean;
}

export interface RecentLeadsData {
  items: RecentLead[];
  total: number;
}

export interface OverviewData {
  leads: LeadData;
  catalog: CatalogData;
  media: MediaData;
  release: ReleaseData;
  recentLeads: RecentLeadsData;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Sum the counts in a series slice covering [dateStr - days, dateStr]. */
function sumSeriesWindow(
  series: LeadSeries[],
  endDateStr: string,
  days: number,
): number {
  const end = new Date(endDateStr + "T23:59:59Z").getTime();
  const start = end - days * 24 * 60 * 60 * 1000;
  return series
    .filter((s) => {
      const t = new Date(s.date + "T00:00:00Z").getTime();
      return t >= start && t <= end;
    })
    .reduce((acc, s) => acc + s.count, 0);
}

/** Compute percent change; returns null when baseline is 0 (avoids div-by-zero). */
function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// ── main aggregator ──────────────────────────────────────────────────────────

/**
 * Fetch and aggregate all data needed by the Overview page.
 *
 * @param range  How many days back to slice the leads chart (7 | 30 | 90).
 */
export async function getOverviewData(range: 7 | 30 | 90): Promise<OverviewData> {
  // Fire all requests concurrently; wrap each in its own try/catch so a single
  // failure doesn't collapse the whole page.
  const [summaryRes, recentRes, productsRes, categoriesRes, assetsRes, diffRes, liveRes] =
    await Promise.all([
      apiServer<FormsSummaryResponse>("/api/forms/summary"),
      apiServer<FormsListResponse>("/api/forms?take=8"),
      apiServer<CatalogItem[]>("/api/catalog/products"),
      apiServer<CatalogItem[]>("/api/catalog/categories"),
      apiServer<AssetItem[]>("/api/assets"),
      apiServer<DiffResponse>("/api/releases/diff"),
      apiServer<LiveResponse>("/api/releases/live"),
    ]);

  // ── leads ────────────────────────────────────────────────────────────────
  const formsSummary = summaryRes.ok ? summaryRes.data : null;
  const fullSeries: LeadSeries[] = formsSummary?.series ?? [];

  // Slice the series to the requested range (most recent `range` days).
  const slicedSeries = fullSeries.slice(-range);

  // Compute deltaPct: this-period vs previous-period of equal length.
  let leadsCurrentPeriod = 0;
  let leadsPreviousPeriod = 0;
  if (fullSeries.length >= range) {
    leadsCurrentPeriod = slicedSeries.reduce((acc, s) => acc + s.count, 0);
    const prevSlice = fullSeries.slice(-(range * 2), -range);
    leadsPreviousPeriod = prevSlice.reduce((acc, s) => acc + s.count, 0);
  } else {
    leadsCurrentPeriod = slicedSeries.reduce((acc, s) => acc + s.count, 0);
    // Not enough history for a prior window
    leadsPreviousPeriod = 0;
  }

  // Fallback: also try summing directly from series if we have the data
  if (fullSeries.length > 0) {
    const todayStr = new Date().toISOString().slice(0, 10);
    leadsCurrentPeriod = sumSeriesWindow(fullSeries, todayStr, range);
    const priorEnd = new Date(Date.now() - range * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    leadsPreviousPeriod = sumSeriesWindow(fullSeries, priorEnd, range);
  }

  const leads: LeadData = {
    total: formsSummary?.total ?? 0,
    new: formsSummary?.new ?? 0,
    deltaPct: deltaPct(leadsCurrentPeriod, leadsPreviousPeriod),
    series: slicedSeries,
  };

  // ── recent leads ─────────────────────────────────────────────────────────
  const recentLeads: RecentLeadsData = recentRes.ok
    ? {
        items: recentRes.data.items as RecentLead[],
        total: recentRes.data.total,
      }
    : { items: [], total: 0 };

  // ── catalog ──────────────────────────────────────────────────────────────
  const catalog: CatalogData = {
    products: productsRes.ok ? productsRes.data.length : 0,
    categories: categoriesRes.ok ? categoriesRes.data.length : 0,
  };

  // ── media ────────────────────────────────────────────────────────────────
  const media: MediaData = {
    assets: assetsRes.ok ? assetsRes.data.length : 0,
  };

  // ── release ──────────────────────────────────────────────────────────────
  const diff = diffRes.ok ? diffRes.data : null;
  const live = liveRes.ok ? liveRes.data : null;
  const release: ReleaseData = {
    liveVersion: live?.version ?? null,
    dirty: diff?.dirty ?? false,
    workingRevision: diff?.revision ?? 0,
    lastPublishedRevision: diff?.lastPublishedRevision ?? 0,
  };

  return { leads, catalog, media, release, recentLeads };
}
