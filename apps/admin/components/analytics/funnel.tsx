// components/analytics/funnel.tsx
import { formatNumber } from "@/app/lib/format";
import type { FunnelResponse } from "@signex/shared";

// Defense-in-depth: stages are expected to be monotonic (each <= the previous), but clamp
// anyway so a future data shape that violates that can never render a negative or >100% bar.
function clampPct(pct: number): number {
  return Math.min(1, Math.max(0, pct));
}
function dropOffPct(prevCount: number, count: number): number {
  const raw = (prevCount - count) / (prevCount || 1);
  return clampPct(raw) * 100;
}

export function Funnel({ data }: { data: FunnelResponse }) {
  if (!data.stages.length) return <p className="py-6 text-center text-sm text-muted-foreground">No data yet</p>;
  return (
    <ol className="flex flex-col gap-2">
      {data.stages.map((s, i) => {
        const pct = clampPct(s.pct);
        return (
          <li key={s.stage} className="rounded-md border border-border bg-card px-3 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{s.stage}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {formatNumber(s.count)} · {(pct * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, pct * 100)}%` }} aria-hidden />
            </div>
            {i > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {dropOffPct(data.stages[i - 1].count, s.count).toFixed(0)}% drop-off
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
