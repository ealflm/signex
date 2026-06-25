import { Skeleton } from "@/components/ui/skeleton";

export default function VisualLoading() {
  return (
    <section className="flex flex-col gap-4">
      {/* Header skeleton */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
      </div>

      {/* Toolbar skeleton */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
        <Skeleton className="h-9 w-44" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      {/* Iframe frame skeleton */}
      <Skeleton className="h-[70vh] w-full rounded-xl" />
    </section>
  );
}
