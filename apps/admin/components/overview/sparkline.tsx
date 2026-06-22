"use client";

import * as React from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { LeadSeries } from "@/app/lib/overview";

/** Tiny axis-less area sparkline in the accent color. Decorative — aria-hidden. */
export function Sparkline({ data }: { data: LeadSeries[] }) {
  const gradientId = React.useId();

  if (data.length < 2) {
    return <div className="h-10 w-full" aria-hidden />;
  }

  return (
    <div className="h-10 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--chart-1)"
            strokeWidth={1.75}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
