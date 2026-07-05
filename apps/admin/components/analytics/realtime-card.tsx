// components/analytics/realtime-card.tsx
"use client";

import { useEffect, useState } from "react";
import type { RealtimeResponse } from "@signex/shared";
import { adminApi } from "@/app/lib/base-path";

export function RealtimeCard() {
  const [data, setData] = useState<RealtimeResponse | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(adminApi("/api/analytics/realtime"), { cache: "no-store" });
        if (alive && res.ok) setData(await res.json());
      } catch {
        /* keep last */
      }
    };
    load();
    const id = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  const active = data?.activeVisitors ?? 0;
  const max = Math.max(1, ...(data?.perMinute ?? []).map((p) => p.value));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active now (5 min)</p>
        <p className="font-mono text-3xl font-semibold tabular-nums text-foreground">{active}</p>
      </div>
      <div className="flex h-12 items-end gap-0.5" aria-hidden>
        {(data?.perMinute ?? []).map((p, i) => (
          <div key={i} className="flex-1 rounded-sm bg-primary/70" style={{ height: `${(p.value / max) * 100}%`, minHeight: 2 }} />
        ))}
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {(data?.topPages ?? []).slice(0, 5).map((pg) => (
          <li key={pg.path} className="flex justify-between gap-2">
            <span className="truncate text-foreground">{pg.path}</span>
            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{pg.pageviews}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
