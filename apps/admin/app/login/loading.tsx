import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton that mirrors the login card layout — shown during the route segment load. */
export default function LoginLoading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      {/* Brand lockup placeholder */}
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-7 rounded-md" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3.5 w-14 rounded" />
          <Skeleton className="h-2.5 w-9 rounded" />
        </div>
      </div>

      {/* Card placeholder */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-6 flex flex-col gap-2">
          <Skeleton className="h-5 w-20 rounded" />
          <Skeleton className="h-3.5 w-48 rounded" />
        </div>
        <div className="flex flex-col gap-4">
          {/* Username field */}
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-10 rounded" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          {/* Password field */}
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-16 rounded" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          {/* Submit button */}
          <Skeleton className="mt-1 h-9 w-full rounded-md" />
        </div>
      </div>
    </main>
  );
}
