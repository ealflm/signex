import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { Uploader } from "./uploader";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { ImagePlus } from "lucide-react";

// Matches AssetDto from apps/api/src/assets/assets.service.ts
interface AssetRow {
  id: string;
  status: "PENDING" | "READY";
  kind: "IMAGE" | "VIDEO" | "SVG";
  sha256: string;
  r2Key: string;
  url: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  originalName: string;
  altDefault: { en: string; vi: string } | null;
  posterId: string | null;
}

export default async function MediaPage() {
  await requireRole("EDITOR");

  const res = await apiServer<AssetRow[]>("/api/assets");
  const assets = res.ok ? res.data : [];
  const apiError = !res.ok;

  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        title="Media"
        subtitle="Upload images and videos. Assets are deduplicated by content hash. Use the picker in Catalog/Content to attach them."
      />

      {/* API error banner */}
      {apiError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Could not load assets. The API may be unavailable.
        </p>
      )}

      {/* Uploader widget */}
      <Uploader />

      {/* Asset grid — doubles as picker source */}
      <SectionCard
        title={
          <>
            Assets
            {assets.length > 0 && (
              <span className="ml-2 font-mono tabular-nums text-xs font-normal text-muted-foreground">
                ({assets.length})
              </span>
            )}
          </>
        }
        bodyClassName={assets.length === 0 ? "p-0" : "p-4"}
      >
        {assets.length === 0 ? (
          <EmptyState
            icon={ImagePlus}
            title="No assets yet"
            description="Upload one above."
          />
        ) : (
          <ul
            role="list"
            aria-label="Asset grid"
            className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6"
          >
            {assets.map((a) => (
              <li key={a.id}>
                <article
                  className="flex flex-col gap-1 rounded-xl border border-border bg-card p-2 transition-colors duration-150 focus-within:ring-2 focus-within:ring-ring outline-none hover:bg-muted/50"
                  tabIndex={0}
                  aria-label={`${a.originalName} — ${a.kind} — ${a.status}`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
                    {a.kind === "IMAGE" && a.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.url}
                        alt={a.altDefault?.en ?? a.originalName}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground"
                      >
                        {a.kind}
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <p
                    className="truncate text-xs font-medium text-foreground"
                    title={a.originalName}
                  >
                    {a.originalName}
                  </p>

                  {/* Dims */}
                  {(a.width != null || a.duration != null) && (
                    <p className="font-mono tabular-nums text-[10px] text-muted-foreground">
                      {a.width != null && a.height != null
                        ? `${a.width}×${a.height}`
                        : null}
                      {a.duration != null
                        ? ` ${Math.round(a.duration)}s`
                        : null}
                    </p>
                  )}

                  {/* Status badge */}
                  <StatusBadge
                    tone={a.status === "READY" ? "success" : "warning"}
                    className="self-start text-[10px]"
                  >
                    <span className="size-1.5 rounded-full bg-current" aria-hidden />
                    {a.status}
                  </StatusBadge>

                  {/* Asset ID (for picker reference) */}
                  <code
                    className="truncate font-mono tabular-nums text-[9px] text-muted-foreground/60"
                    title={a.id}
                  >
                    {a.id}
                  </code>
                </article>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </section>
  );
}
