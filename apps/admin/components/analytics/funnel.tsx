// components/analytics/funnel.tsx
import { formatNumber } from "@/app/lib/format";
import type { FunnelResponse } from "@signex/shared";

export function Funnel({ data }: { data: FunnelResponse }) {
  if (!data.stages.length) return <p className="py-6 text-center text-sm text-muted-foreground">No data yet</p>;
  return (
    <ol className="flex flex-col gap-2">
      {data.stages.map((s, i) => (
        <li key={s.stage} className="rounded-md border border-border bg-card px-3 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">{s.stage}</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {formatNumber(s.count)} · {(s.pct * 100).toFixed(0)}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, s.pct * 100)}%` }} aria-hidden />
          </div>
          {i > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {(((data.stages[i - 1].count - s.count) / (data.stages[i - 1].count || 1)) * 100).toFixed(0)}% drop-off
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
