import { Suspense } from "react";
import { getOverviewData } from "@/app/lib/overview";
import { KpiCards } from "@/components/overview/kpi-cards";
import { LeadsChart } from "@/components/overview/leads-chart";
import { RecentLeadsTable } from "@/components/overview/recent-leads-table";
import {
  ChartSkeleton,
  KpiCardsSkeleton,
  TableSkeleton,
} from "@/components/overview/skeletons";

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Leads, catalog, and release status at a glance.
        </p>
      </header>

      {/* Single Suspense boundary over the one server fetch — each surface streams in
          with a skeleton that matches its own layout. The static header paints first. */}
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewBody />
      </Suspense>
    </div>
  );
}

async function OverviewBody() {
  // 90 days fetched once; the chart slices to 7/30/90 client-side (no refetch).
  const data = await getOverviewData(90);

  return (
    <div className="flex flex-col gap-6">
      <KpiCards data={data} />
      <LeadsChart series={data.leads.series} />
      <RecentLeadsTable items={data.recentLeads.items} />
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <KpiCardsSkeleton />
      <ChartSkeleton />
      <TableSkeleton />
    </div>
  );
}
