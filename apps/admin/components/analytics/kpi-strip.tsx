// components/analytics/kpi-strip.tsx
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/app/lib/format";
import type { OverviewResponse } from "@signex/shared";

function pct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return (cur - prev) / prev;
}
function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-[11px] text-muted-foreground">—</span>;
  const up = value >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", good ? "text-success" : "text-destructive")}>
      <Icon className="size-3" aria-hidden />
      {Math.abs(value * 100).toFixed(0)}%
    </span>
  );
}

export function KpiStrip({ overview }: { overview: OverviewResponse }) {
  const c = overview.current;
  const p = overview.previous;
  const cells: { label: string; value: string; delta: number | null; invert?: boolean }[] = [
    { label: "Visitors", value: formatNumber(c.visitors), delta: pct(c.visitors, p.visitors) },
    { label: "Sessions", value: formatNumber(c.sessions), delta: pct(c.sessions, p.sessions) },
    { label: "Pageviews", value: formatNumber(c.pageviews), delta: pct(c.pageviews, p.pageviews) },
    { label: "Avg session", value: `${c.avgSessionSec}s`, delta: pct(c.avgSessionSec, p.avgSessionSec) },
    { label: "Bounce", value: `${Math.round(c.bounceRate * 100)}%`, delta: pct(c.bounceRate, p.bounceRate), invert: true },
    { label: "Leads", value: formatNumber(c.leads), delta: pct(c.leads, p.leads) },
    { label: "Conversion", value: `${(c.conversionRate * 100).toFixed(1)}%`, delta: pct(c.conversionRate, p.conversionRate) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4 xl:grid-cols-7">
      {cells.map((s) => (
        <div key={s.label} className="bg-card p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</dt>
          <dd className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-foreground">{s.value}</dd>
          <div className="mt-1"><Delta value={s.delta} invert={s.invert} /></div>
        </div>
      ))}
    </dl>
  );
}
