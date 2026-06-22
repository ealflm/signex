import { Skeleton } from "@/components/ui/skeleton";

export default function ContentBlockLoading() {
  return (
    <section className="flex flex-col gap-6">
      {/* Page header skeleton */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Navigator pills skeleton */}
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-20 rounded-full" />
        ))}
      </div>

      {/* Editor card skeleton */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex flex-col gap-5 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-9 w-full max-w-xl" />
            </div>
          ))}
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
    </section>
  );
}
