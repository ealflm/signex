import { Skeleton } from "@/components/ui/skeleton";

export default function CatalogLoading() {
  return (
    <section className="flex flex-col gap-8">
      {/* Header skeleton */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Categories card skeleton */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="p-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>

      {/* Products card skeleton */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="p-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
