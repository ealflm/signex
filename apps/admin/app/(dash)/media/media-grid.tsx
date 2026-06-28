"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/admin/status-badge";
import { AssetDialog } from "./asset-dialog";
import type { AssetRow } from "./types";

export function MediaGrid({
  assets,
  canDelete,
  onChanged,
}: {
  assets: AssetRow[];
  canDelete: boolean;
  onChanged?: () => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<AssetRow | null>(null);

  return (
    <>
      <ul
        role="list"
        aria-label="Asset grid"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6"
      >
        {assets.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => setSelected(a)}
              aria-label={`${a.originalName} — ${a.kind} — open details`}
              className="flex w-full flex-col gap-1 rounded-xl border border-border bg-card p-2 text-left transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* Thumbnail — IMAGE/SVG via <img>, VIDEO via a first-frame <video> (#t=0.1). */}
              <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
                {a.url && (a.kind === "IMAGE" || a.kind === "SVG") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.url}
                    alt={a.altDefault?.en ?? a.originalName}
                    className={cn(
                      "h-full w-full",
                      a.kind === "SVG" ? "object-contain p-3" : "object-cover",
                    )}
                    loading="lazy"
                  />
                ) : a.url && a.kind === "VIDEO" ? (
                  <video
                    src={`${a.url}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                    aria-label={a.originalName}
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

              <p className="truncate text-xs font-medium text-foreground" title={a.originalName}>
                {a.originalName}
              </p>

              {(a.width != null || a.duration != null) && (
                <p className="font-mono tabular-nums text-[10px] text-muted-foreground">
                  {a.width != null && a.height != null ? `${a.width}×${a.height}` : null}
                  {a.duration != null ? ` ${Math.round(a.duration)}s` : null}
                </p>
              )}

              <StatusBadge
                tone={a.status === "READY" ? "success" : "warning"}
                className="self-start text-[10px]"
              >
                <span className="size-1.5 rounded-full bg-current" aria-hidden />
                {a.status}
              </StatusBadge>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <AssetDialog
          key={selected.id}
          asset={selected}
          canDelete={canDelete}
          onChanged={onChanged}
          open={selected != null}
          onOpenChange={(o) => !o && setSelected(null)}
        />
      )}
    </>
  );
}
