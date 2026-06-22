import { Skeleton } from "@/components/ui/skeleton";

export default function ReleasesLoading() {
  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Status + Publish card */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="contents">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16 justify-self-end" />
            </div>
          ))}
        </div>
        <Skeleton className="my-4 h-px w-full" />
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-16 w-72" />
          </div>
          <Skeleton className="h-9 w-20" />
        </div>
      </div>

      {/* History table card */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="p-5 flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </section>
  );
}
