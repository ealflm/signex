// app/(dash)/analytics/page.tsx
import { Suspense } from "react";
import { requireRole } from "@/app/lib/session";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { getAnalyticsData, rangeFromPreset } from "@/app/lib/analytics";
import { RangeTabs } from "@/components/analytics/range-tabs";
import { KpiStrip } from "@/components/analytics/kpi-strip";
import { TrafficChart } from "@/components/analytics/traffic-chart";
import { RealtimeCard } from "@/components/analytics/realtime-card";
import { BarList } from "@/components/analytics/bars";
import { Funnel } from "@/components/analytics/funnel";
import { CampaignsTable, AttributionTable } from "@/components/analytics/tables";
import { AnalyticsSkeleton } from "./loading";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireRole("EDITOR");
  const sp = await searchParams;
  const preset = sp.range === "7" || sp.range === "90" ? sp.range : "30";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        subtitle="First-party traffic, sources, catalog behavior and lead conversion."
        actions={<RangeTabs current={preset} />}
      />
      <Suspense key={preset} fallback={<AnalyticsSkeleton />}>
        <AnalyticsBody preset={Number(preset)} />
      </Suspense>
    </div>
  );
}

async function AnalyticsBody({ preset }: { preset: number }) {
  const data = await getAnalyticsData(rangeFromPreset(preset));
  return (
    <div className="flex flex-col gap-6">
      <KpiStrip overview={data.overview} />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <SectionCard title="Traffic" description="Sessions over time">
          <TrafficChart series={data.timeseries} />
        </SectionCard>
        <SectionCard title="Realtime">
          <RealtimeCard />
        </SectionCard>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Top pages">
          <BarList rows={data.topPages.map((p) => ({ label: p.path, value: p.pageviews }))} />
        </SectionCard>
        <SectionCard title="Channels">
          <BarList rows={data.sources.channels.map((c) => ({ label: c.channel, value: c.sessions }))} />
        </SectionCard>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Categories viewed">
          <BarList rows={data.catalog.categories.map((c) => ({ label: c.slug, value: c.views }))} />
        </SectionCard>
        <SectionCard title="Products viewed" description={`Quote CTA clicks: ${data.catalog.ctaClicks}`}>
          <BarList rows={data.catalog.products.map((c) => ({ label: c.slug, value: c.views }))} />
        </SectionCard>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Conversion funnel">
          <Funnel data={data.funnel} />
        </SectionCard>
        <SectionCard title="Lead attribution" description="Leads by channel">
          <AttributionTable rows={data.funnel.attribution} />
        </SectionCard>
      </div>
      <SectionCard title="Campaigns">
        <CampaignsTable rows={data.sources.campaigns} />
      </SectionCard>
    </div>
  );
}
