import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/admin/section-card";

export default function UsersLoading() {
  return (
    <section className="flex flex-col gap-6">
      {/* Page header skeleton */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Table skeleton */}
      <SectionCard bodyClassName="p-0">
        <div className="divide-y divide-border">
          {/* Table header */}
          <div className="flex h-10 items-center gap-4 px-4">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-28" />
          </div>
          {/* Table rows */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-7 w-32 rounded-md" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-7 w-20 rounded-md" />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Create form skeleton */}
      <SectionCard title="Add new user">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          <div className="flex items-end">
            <Skeleton className="h-9 w-20 rounded-md" />
          </div>
        </div>
      </SectionCard>
    </section>
  );
}
