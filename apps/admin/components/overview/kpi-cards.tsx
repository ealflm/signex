import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDot } from "lucide-react";
import type { OverviewData } from "@/app/lib/overview";
import { formatNumber } from "@/app/lib/format";
import { Sparkline } from "./sparkline";

function KpiCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="group rounded-xl border border-border bg-card p-5 transition-[border-color,box-shadow] duration-150 hover:border-foreground/15 hover:shadow-elevated">
      {children}
    </div>
  );
}

function KpiLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] font-medium text-muted-foreground">{children}</p>
  );
}

function KpiValue({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-foreground">
      {children}
    </p>
  );
}

/** Restrained +/- delta pill. Up = success, down = destructive, null = neutral "new". */
function Delta({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="text-xs font-medium text-muted-foreground">No prior data</span>
    );
  }
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums " +
        (up ? "text-success" : "text-destructive")
      }
    >
      <Icon className="size-3.5" aria-hidden />
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

export function KpiCards({ data }: { data: OverviewData }) {
  const { leads, catalog, media, release } = data;
  const liveDirty = release.dirty;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Leads */}
      <KpiCard>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <KpiLabel>New leads</KpiLabel>
            <KpiValue>{formatNumber(leads.new)}</KpiValue>
          </div>
          <Delta pct={leads.deltaPct} />
        </div>
        <div className="mt-3">
          <Sparkline data={leads.series} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {formatNumber(leads.total)} total all-time
        </p>
      </KpiCard>

      {/* Products */}
      <KpiCard>
        <div className="space-y-1.5">
          <KpiLabel>Products</KpiLabel>
          <KpiValue>{formatNumber(catalog.products)}</KpiValue>
        </div>
        <p className="mt-3 text-xs text-muted-foreground tabular-nums">
          {formatNumber(catalog.categories)}{" "}
          {catalog.categories === 1 ? "category" : "categories"}
        </p>
      </KpiCard>

      {/* Media assets */}
      <KpiCard>
        <div className="space-y-1.5">
          <KpiLabel>Media assets</KpiLabel>
          <KpiValue>{formatNumber(media.assets)}</KpiValue>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">In the media library</p>
      </KpiCard>

      {/* Live release */}
      <KpiCard>
        <div className="space-y-1.5">
          <KpiLabel>Live release</KpiLabel>
          <KpiValue>
            {release.liveVersion != null ? (
              <>
                v<span>{release.liveVersion}</span>
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </KpiValue>
        </div>
        <div className="mt-3">
          {liveDirty ? (
            <Link
              href="/releases"
              className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning transition-colors duration-150 hover:bg-warning/15"
            >
              <CircleDot className="size-3.5" aria-hidden />
              Unpublished changes
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
              <CheckCircle2 className="size-3.5" aria-hidden />
              Up to date
            </span>
          )}
        </div>
      </KpiCard>
    </div>
  );
}
