import { Skeleton } from "@/components/ui/skeleton";

export default function ThemesLoading() {
  return (
    <section className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Card grid — 3 skeleton cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-0 rounded-xl border border-border bg-card py-6"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-6 pb-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-14" />
            </div>

            {/* Meta */}
            <div className="flex-1 px-6 pb-4">
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="contents">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-10" />
                  </div>
                ))}
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex gap-2 border-t border-border px-6 pt-4">
              <Skeleton className="h-8 w-14" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
