"use client";

import { useCallback, useState } from "react";
import { ImagePlus } from "lucide-react";
import { SectionCard } from "@/components/admin/section-card";
import { EmptyState } from "@/components/admin/empty-state";
import { Uploader } from "./uploader";
import { MediaGrid } from "./media-grid";
import type { AssetRow } from "./types";

// Owns the asset list client-side. The server passes the initial list (fast first paint), then any
// upload / alt-edit / delete calls refresh() to re-fetch — so the grid updates instantly without a
// server round-trip refresh (router.refresh()/revalidatePath don't reliably re-render this route).
export function MediaManager({
  initialAssets,
  canDelete,
}: {
  initialAssets: AssetRow[];
  canDelete: boolean;
}) {
  const [assets, setAssets] = useState<AssetRow[]>(initialAssets);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/admin-api/assets", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as AssetRow[];
        if (Array.isArray(data)) setAssets(data);
      }
    } catch {
      /* keep the current list on a transient error */
    }
  }, []);

  return (
    <>
      <Uploader onUploaded={refresh} />

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
          <EmptyState icon={ImagePlus} title="No assets yet" description="Upload one above." />
        ) : (
          <MediaGrid assets={assets} canDelete={canDelete} onChanged={refresh} />
        )}
      </SectionCard>
    </>
  );
}
