"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import type { LeadSeries } from "@/app/lib/overview";
import { formatDateLabel } from "@/app/lib/format";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Range = "7" | "30" | "90";

const RANGES: { value: Range; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

/** Compact tooltip: date + count, mono, on a popover surface. */
function ChartTooltip({
  active,
  payload,
}: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as LeadSeries;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-elevated">
      <p className="text-xs font-medium text-muted-foreground">
        {formatDateLabel(point.date)}
      </p>
      <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
        {point.count} {point.count === 1 ? "lead" : "leads"}
      </p>
    </div>
  );
}

/**
 * Self-contained leads chart card. Owns the 7/30/90 range; receives up to 90
 * days of series from the server and slices client-side (no refetch). The range
 * switch is rendered in the page header via the shared {@link RangeTabs} but the
 * canonical control lives here so the page can stay a server component.
 */
export function LeadsChart({ series }: { series: LeadSeries[] }) {
  const [range, setRange] = React.useState<Range>("90");

  const sliced = React.useMemo(() => series.slice(-Number(range)), [series, range]);
  const total = React.useMemo(
    () => sliced.reduce((acc, s) => acc + s.count, 0),
    [sliced],
  );
  const hasData = sliced.some((s) => s.count > 0);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Leads over time</h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            {total} {total === 1 ? "submission" : "submissions"} in the last {range} days
          </p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList className="h-8 bg-muted/60">
            {RANGES.map((r) => (
              <TabsTrigger
                key={r.value}
                value={r.value}
                className="px-3 font-mono text-xs tabular-nums data-[state=active]:text-primary"
              >
                {r.value}d
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      <div className="mt-5 h-64 w-full">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sliced} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="leadsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeOpacity={0.5}
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateLabel}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                className="font-mono tabular-nums"
                dy={6}
              />
              <YAxis
                allowDecimals={false}
                width={40}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                className="font-mono tabular-nums"
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#leadsFill)"
                dot={false}
                activeDot={{
                  r: 3.5,
                  fill: "var(--chart-1)",
                  stroke: "var(--card)",
                  strokeWidth: 2,
                }}
                animationDuration={300}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <LineChartIcon className="size-6 text-muted-foreground/60" aria-hidden />
            <p className="text-sm font-medium text-foreground">No leads in this range</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Submissions from your site forms will appear here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export type { Range };
export { RANGES };
