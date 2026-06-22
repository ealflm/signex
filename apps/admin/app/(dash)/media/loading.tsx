import { Skeleton } from "@/components/ui/skeleton";

export default function MediaLoading() {
  return (
    <section className="flex flex-col gap-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Uploader card skeleton */}
      <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full" />
      </div>

      {/* Asset grid skeleton */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
        <Skeleton className="h-4 w-16" />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6" aria-hidden>
          {Array.from({ length: 12 }).map((_, i) => (
            <li key={i} className="flex flex-col gap-1 rounded-xl border border-border bg-card p-2">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-4 w-12 rounded-full" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
