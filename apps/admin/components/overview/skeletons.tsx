import { Skeleton } from "@/components/ui/skeleton";

/** KPI row skeleton — 4 cards matching the real layout. */
export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-16" />
            </div>
            <Skeleton className="h-4 w-10" />
          </div>
          <Skeleton className="mt-4 h-10 w-full" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Main chart skeleton — header + plot block. */
export function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-8 w-44 rounded-lg" />
      </div>
      <Skeleton className="mt-5 h-64 w-full rounded-md" />
    </div>
  );
}

/** Recent-leads table skeleton — header + 6 rows. */
export function TableSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-8 w-56 rounded-lg" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            <Skeleton className="h-5 w-16 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
