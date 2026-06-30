import * as React from "react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/app/lib/format";
import type { SubmissionSummary } from "@/app/lib/forms";

interface Stat {
  label: string;
  value: number;
  /** The actionable count — the one figure the team acts on — reads in primary. */
  hero?: boolean;
  hint?: string;
}

/**
 * One instrument, four readings — the triage pipeline: total / new / read /
 * archived. A single bar with hairline dividers (the 1px grid gap over a
 * border-coloured backplate), not four floating cards, so the strip reads as
 * one gauge. "New" is the hero: it's the only number anyone acts on.
 */
export function LeadsKpiStrip({ summary }: { summary: SubmissionSummary }) {
  const stats: Stat[] = [
    { label: "Total", value: summary.total },
    {
      label: "New",
      value: summary.new,
      hero: true,
      hint: summary.new > 0 ? "awaiting reply" : "all caught up",
    },
    { label: "Read", value: summary.read },
    { label: "Archived", value: summary.archived },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-card p-4 sm:p-5">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {s.label}
          </dt>
          <dd
            className={cn(
              "mt-1.5 font-mono text-2xl font-semibold tabular-nums",
              s.hero ? "text-primary" : "text-foreground",
            )}
          >
            {formatNumber(s.value)}
          </dd>
          {s.hint && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{s.hint}</p>
          )}
        </div>
      ))}
    </dl>
  );
}
