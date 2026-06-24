import * as React from "react";
import { formatNumber } from "@/app/lib/format";
import type { SubmissionSummary } from "@/app/lib/forms";

interface Stat {
  label: string;
  value: number;
  /** Optional accent on the value (used for the "New" count). */
  accent?: boolean;
}

/**
 * Compact KPI strip for the inbox: total / new / quote / contact.
 * Token-driven, mono tabular numbers; mirrors the Overview KPI surfaces but denser.
 */
export function LeadsKpiStrip({ summary }: { summary: SubmissionSummary }) {
  const stats: Stat[] = [
    { label: "Total", value: summary.total },
    { label: "New", value: summary.new, accent: true },
    { label: "Quote", value: summary.byKey.quote },
    { label: "Contact", value: summary.byKey.contact },
  ];

  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-border bg-card p-4"
        >
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {s.label}
          </dt>
          <dd
            className={
              "mt-1.5 font-mono text-2xl font-semibold tabular-nums " +
              (s.accent ? "text-primary" : "text-foreground")
            }
          >
            {formatNumber(s.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
