// apps/api/src/analytics/query.service.ts
import { Injectable } from "@nestjs/common";
import type {
  OverviewResponse, OverviewKpis, TimeseriesPoint, TopPage,
  SourcesResponse, CatalogInsightsResponse, FunnelResponse, RealtimeResponse,
  Channel, ChannelStat, CampaignStat, CatalogStat,
} from "@signex/shared";
import { PrismaService } from "../prisma/prisma.service";
import { VALID_FORM_KEYS } from "../forms/dto/forms.dto";

export interface Range { from: string; to: string; }

function bounds(r: Range): { gte: Date; lt: Date } {
  return { gte: new Date(r.from), lt: new Date(r.to) };
}
function prevRange(r: Range): Range {
  const from = new Date(r.from).getTime();
  const to = new Date(r.to).getTime();
  const span = to - from;
  return { from: new Date(from - span).toISOString(), to: new Date(from).toISOString() };
}

@Injectable()
export class QueryService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(r: Range): Promise<OverviewResponse> {
    const [current, previous] = await Promise.all([this.kpis(r), this.kpis(prevRange(r))]);
    return { current, previous };
  }

  private async kpis(r: Range): Promise<OverviewKpis> {
    const occurredAt = bounds(r);
    const startedAt = bounds(r);
    const c = this.prisma.client;
    const [visitorRows, pageviews, sessions, bounced, agg, leads, convertedSessions] = await Promise.all([
      c.analyticsEvent.findMany({ where: { occurredAt }, distinct: ["visitorId"], select: { visitorId: true } }),
      c.analyticsEvent.count({ where: { occurredAt, kind: "page_view" } }),
      c.analyticsSession.count({ where: { startedAt } }),
      c.analyticsSession.count({ where: { startedAt, bounced: true } }),
      c.analyticsSession.aggregate({ where: { startedAt }, _avg: { durationSec: true } }),
      // Headline lead total: real business leads only (unflagged, current form key).
      // Unattributed rows (no sessionId, e.g. DNT/pre-tracker) are still real leads, so no sessionId filter here.
      c.formSubmission.count({
        where: { createdAt: startedAt, flagged: false, formKey: { in: [...VALID_FORM_KEYS] } },
      }),
      // Converted-session count backs conversionRate — bounded and consistent with `sessions`.
      c.analyticsSession.count({ where: { startedAt, converted: true } }),
    ]);
    const visitors = visitorRows.length;
    return {
      visitors,
      sessions,
      pageviews,
      avgSessionSec: Math.round(agg._avg.durationSec ?? 0),
      bounceRate: sessions ? bounced / sessions : 0,
      leads,
      // Intentionally NOT leads/sessions: `leads` may include unattributed rows (honest headline
      // total), while conversionRate is a bounded (<=1) rate over sessions that actually converted.
      conversionRate: sessions ? convertedSessions / sessions : 0,
    };
  }

  async timeseries(r: Range, metric: "sessions" | "visitors" | "pageviews", interval: "day" | "hour"): Promise<TimeseriesPoint[]> {
    // Pull the minimal columns and bucket in JS (portable, no raw SQL / tz surprises).
    const occurredAt = bounds(r);
    const rows = await this.prisma.client.analyticsEvent.findMany({
      where: metric === "pageviews" ? { occurredAt, kind: "page_view" } : { occurredAt },
      select: { occurredAt: true, visitorId: true, sessionId: true },
      orderBy: { occurredAt: "asc" },
    });
    const buckets = new Map<string, Set<string> | number>();
    const keyFor = (d: Date) =>
      interval === "hour" ? d.toISOString().slice(0, 13) + ":00:00.000Z" : d.toISOString().slice(0, 10);
    for (const row of rows) {
      const k = keyFor(row.occurredAt);
      if (metric === "pageviews") {
        buckets.set(k, ((buckets.get(k) as number) ?? 0) + 1);
      } else {
        const set = (buckets.get(k) as Set<string>) ?? new Set<string>();
        set.add(metric === "visitors" ? row.visitorId : row.sessionId);
        buckets.set(k, set);
      }
    }
    return [...buckets.entries()]
      .map(([bucket, v]) => ({ bucket, value: typeof v === "number" ? v : v.size }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  async topPages(r: Range, limit = 10): Promise<TopPage[]> {
    const occurredAt = bounds(r);
    const rows = await this.prisma.client.analyticsEvent.findMany({
      where: { occurredAt, kind: "page_view" },
      select: { path: true, visitorId: true },
    });
    const map = new Map<string, { pageviews: number; visitors: Set<string> }>();
    for (const row of rows) {
      const e = map.get(row.path) ?? { pageviews: 0, visitors: new Set<string>() };
      e.pageviews += 1;
      e.visitors.add(row.visitorId);
      map.set(row.path, e);
    }
    return [...map.entries()]
      .map(([path, e]) => ({ path, pageviews: e.pageviews, visitors: e.visitors.size }))
      .sort((a, b) => b.pageviews - a.pageviews)
      .slice(0, limit);
  }

  async sources(r: Range): Promise<SourcesResponse> {
    const startedAt = bounds(r);
    const sessions = await this.prisma.client.analyticsSession.findMany({
      where: { startedAt },
      select: { channel: true, utmCampaign: true, referrer: true, converted: true },
    });
    const chan = new Map<string, ChannelStat>();
    const camp = new Map<string, CampaignStat>();
    const ref = new Map<string, number>();
    for (const s of sessions) {
      const ch = chan.get(s.channel) ?? { channel: s.channel as Channel, sessions: 0, leads: 0 };
      ch.sessions += 1;
      if (s.converted) ch.leads += 1;
      chan.set(s.channel, ch);
      if (s.utmCampaign) {
        const cm = camp.get(s.utmCampaign) ?? { campaign: s.utmCampaign, sessions: 0, leads: 0 };
        cm.sessions += 1;
        if (s.converted) cm.leads += 1;
        camp.set(s.utmCampaign, cm);
      }
      if (s.referrer) {
        try {
          const host = new URL(s.referrer).host;
          ref.set(host, (ref.get(host) ?? 0) + 1);
        } catch { /* ignore unparseable referrer */ }
      }
    }
    return {
      channels: [...chan.values()].sort((a, b) => b.sessions - a.sessions),
      campaigns: [...camp.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 20),
      referrers: [...ref.entries()].map(([referrer, sessions]) => ({ referrer, sessions }))
        .sort((a, b) => b.sessions - a.sessions).slice(0, 10),
    };
  }

  async catalog(r: Range): Promise<CatalogInsightsResponse> {
    const occurredAt = bounds(r);
    const [rows, ctaClicks] = await Promise.all([
      this.prisma.client.analyticsEvent.findMany({
        where: { occurredAt, kind: { in: ["category_view", "product_view"] } },
        select: { kind: true, catalogSlug: true, productSlug: true, visitorId: true },
      }),
      this.prisma.client.analyticsEvent.count({ where: { occurredAt, kind: "cta_click" } }),
    ]);
    const roll = (pick: (row: (typeof rows)[number]) => string | null) => {
      const m = new Map<string, { views: number; visitors: Set<string> }>();
      for (const row of rows) {
        const slug = pick(row);
        if (!slug) continue;
        const e = m.get(slug) ?? { views: 0, visitors: new Set<string>() };
        e.views += 1;
        e.visitors.add(row.visitorId);
        m.set(slug, e);
      }
      return [...m.entries()].map(([slug, e]): CatalogStat => ({ slug, views: e.views, visitors: e.visitors.size }))
        .sort((a, b) => b.views - a.views).slice(0, 10);
    };
    return {
      categories: roll((row) => (row.kind === "category_view" ? row.catalogSlug : null)),
      products: roll((row) => (row.kind === "product_view" ? row.productSlug : null)),
      ctaClicks,
    };
  }

  async funnel(r: Range): Promise<FunnelResponse> {
    const occurredAt = bounds(r);
    const startedAt = bounds(r);
    const c = this.prisma.client;
    const [visits, productViewers, ctaSessions, leadRows] = await Promise.all([
      c.analyticsSession.count({ where: { startedAt } }),
      c.analyticsEvent.findMany({ where: { occurredAt, kind: "product_view" }, distinct: ["sessionId"], select: { sessionId: true } }),
      c.analyticsEvent.findMany({ where: { occurredAt, kind: "cta_click" }, distinct: ["sessionId"], select: { sessionId: true } }),
      // Same attributed, non-spam, current-form-key population as the `attribution` breakdown
      // below (and as `leads` in kpis()) — keeps the funnel monotonic (Lead <= Visit).
      c.formSubmission.findMany({
        where: { createdAt: startedAt, sessionId: { not: null }, flagged: false, formKey: { in: [...VALID_FORM_KEYS] } },
        select: { sessionId: true },
      }),
    ]);
    const leads = leadRows.length;
    const first = visits || 1;
    const stages = [
      { stage: "Visit", count: visits },
      { stage: "Product view", count: productViewers.length },
      { stage: "Quote CTA", count: ctaSessions.length },
      { stage: "Lead", count: leads },
    ].map((s) => ({ ...s, pct: s.count / first }));

    // attribution: leads by the channel of their session (once per lead, not per session)
    const leadSessionIds = leadRows.map((l) => l.sessionId).filter((x): x is string => !!x);
    const leadSessions = leadSessionIds.length
      ? await c.analyticsSession.findMany({ where: { id: { in: leadSessionIds } }, select: { id: true, channel: true } })
      : [];
    const channelBySession = new Map(leadSessions.map((s) => [s.id, s.channel]));
    const byChannel = new Map<string, number>();
    for (const l of leadRows) {
      const ch = l.sessionId ? channelBySession.get(l.sessionId) : undefined;
      if (ch) byChannel.set(ch, (byChannel.get(ch) ?? 0) + 1);
    }
    const attribution = [...byChannel.entries()].map(([key, leads]) => ({ key, leads }))
      .sort((a, b) => b.leads - a.leads);
    return { stages, attribution };
  }

  async realtime(): Promise<RealtimeResponse> {
    const now = Date.now();
    const c = this.prisma.client;
    const [events, leads] = await Promise.all([
      c.analyticsEvent.findMany({
        where: { occurredAt: { gte: new Date(now - 30 * 60_000) } },
        select: { kind: true, path: true, occurredAt: true, visitorId: true },
        orderBy: { occurredAt: "desc" },
      }),
      c.formSubmission.findMany({
        where: { createdAt: { gte: new Date(now - 30 * 60_000) } },
        select: { createdAt: true, formKey: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const active = new Set(events.filter((e) => e.occurredAt.getTime() >= now - 5 * 60_000).map((e) => e.visitorId));
    // per-minute pageview buckets for the last 30 minutes
    const perMinute: TimeseriesPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const lo = now - (i + 1) * 60_000;
      const hi = now - i * 60_000;
      const count = events.filter((e) => e.kind === "page_view" && e.occurredAt.getTime() >= lo && e.occurredAt.getTime() < hi).length;
      perMinute.push({ bucket: new Date(hi).toISOString().slice(11, 16), value: count });
    }
    const pageTop = new Map<string, { pageviews: number; visitors: Set<string> }>();
    for (const e of events) {
      if (e.kind !== "page_view") continue;
      const x = pageTop.get(e.path) ?? { pageviews: 0, visitors: new Set<string>() };
      x.pageviews += 1;
      x.visitors.add(e.visitorId);
      pageTop.set(e.path, x);
    }
    const topPages: TopPage[] = [...pageTop.entries()]
      .map(([path, x]) => ({ path, pageviews: x.pageviews, visitors: x.visitors.size }))
      .sort((a, b) => b.pageviews - a.pageviews).slice(0, 8);
    const recent = [
      ...events.slice(0, 20).map((e) => ({ kind: e.kind as never, path: e.path, occurredAt: e.occurredAt.toISOString() })),
      ...leads.map((l) => ({ kind: "lead" as const, path: `/${l.formKey}`, occurredAt: l.createdAt.toISOString() })),
    ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 20);
    return { activeVisitors: active.size, perMinute, topPages, recent };
  }
}
