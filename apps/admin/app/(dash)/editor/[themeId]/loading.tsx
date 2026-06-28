import { Skeleton } from "@/components/ui/skeleton";

export default function EditorLoading() {
  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col overflow-hidden rounded-lg border border-border bg-background">
      {/* Toolbar skeleton */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-28" />
        <div className="flex-1" />
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
      </div>

      {/* 3-zone row skeleton */}
      <div className="flex flex-1 gap-px overflow-hidden bg-border">
        <div className="w-[18%] min-w-[140px] bg-card p-3">
          <Skeleton className="mb-3 h-4 w-24" />
          <Skeleton className="mb-2 h-7 w-full" />
          <Skeleton className="mb-2 h-7 w-full" />
          <Skeleton className="h-7 w-3/4" />
        </div>
        <div className="flex flex-1 items-center justify-center bg-muted/30 p-2">
          <Skeleton className="h-full w-full rounded-md" />
        </div>
        <div className="w-[26%] min-w-[200px] bg-card p-4">
          <Skeleton className="mb-4 h-4 w-28" />
          <Skeleton className="mb-3 h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}
