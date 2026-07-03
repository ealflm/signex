// components/analytics/bars.tsx
import { cn } from "@/lib/utils";
import { formatNumber } from "@/app/lib/format";

export interface BarRow { label: string; value: number; href?: string; }

export function BarList({ rows, unit = "" }: { rows: BarRow[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No data yet</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="relative flex items-center justify-between gap-3 rounded-md px-2 py-1.5">
          <span className="absolute inset-y-0 left-0 rounded-md bg-primary/8" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden />
          <span className={cn("relative truncate text-sm text-foreground")}>{r.label}</span>
          <span className="relative shrink-0 font-mono text-sm tabular-nums text-muted-foreground">{formatNumber(r.value)}{unit}</span>
        </li>
      ))}
    </ul>
  );
}
