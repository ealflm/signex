import { Skeleton } from "@/components/ui/skeleton";

export default function CategoryDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <Skeleton className="h-3 w-56" />

      {/* Identity hero */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-elevated">
        <div className="grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="border-b border-border p-5 sm:border-b-0 sm:border-r">
            <Skeleton className="aspect-[4/3] w-full rounded-lg" />
            <Skeleton className="mt-3 h-8 w-32" />
          </div>
          <div className="flex flex-col gap-4 p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-3 w-40" />
            <div className="mt-auto grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2 bg-card p-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-8" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Details card */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex flex-col gap-4 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
        <div className="flex justify-end border-t border-border px-5 py-4">
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      {/* Products */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="p-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0"
            >
              <Skeleton className="size-10 shrink-0 rounded-md" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="ml-auto h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
