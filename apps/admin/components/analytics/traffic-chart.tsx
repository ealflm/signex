// components/analytics/traffic-chart.tsx
"use client";

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
import { Activity } from "lucide-react";
import type { TimeseriesPoint } from "@signex/shared";
import { formatDateLabel, formatNumber } from "@/app/lib/format";
import { EmptyState } from "@/components/admin/empty-state";

/** Compact tooltip: date + value, mono, on a popover surface. Mirrors LeadsChart's ChartTooltip. */
function ChartTooltip({
  active,
  payload,
}: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as TimeseriesPoint;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-elevated">
      <p className="text-xs font-medium text-muted-foreground">
        {formatDateLabel(point.bucket)}
      </p>
      <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
        {formatNumber(point.value)} sessions
      </p>
    </div>
  );
}

/**
 * Traffic-over-time area chart. The range itself is owned by the page (via
 * {@link RangeTabs} driving `?range` and a server refetch), so unlike
 * LeadsChart this component has no internal range switcher — it just renders
 * whatever series the server hands it.
 */
export function TrafficChart({ series }: { series: TimeseriesPoint[] }) {
  if (series.length < 2) {
    return (
      <EmptyState
        icon={Activity}
        title="Not enough traffic yet"
        description="Sessions over time will appear here once there's more than one day of data."
      />
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
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
            dataKey="bucket"
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
            dataKey="value"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#trafficFill)"
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
    </div>
  );
}
