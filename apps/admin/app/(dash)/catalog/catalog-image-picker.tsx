"use client";

import { useCallback, useState } from "react";
import { ImageOff, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  MediaPickerDialog,
  type AssetRow,
  type MediaRef,
} from "@/app/(dash)/visual/media-picker-dialog";

/**
 * Catalog image field — the SAME media picker the theme editor uses (Library +
 * Upload → crop), so catalog images are picked/uploaded exactly like everywhere
 * else. Posts the chosen asset id via a hidden `imageId` input (unchanged form
 * contract). The library is fetched client-side on open (and refreshed after an
 * upload), mirroring the editor; the current image's URL is seeded from the
 * server-resolved `defaultImageUrl` so the preview never flashes.
 */
export function CatalogImagePicker({
  name = "imageId",
  field,
  defaultImageId,
  defaultImageUrl,
  label = "Image",
}: {
  /** Hidden input name posted to the server action. */
  name?: string;
  /** Aspect/label key: "catalog.category.image" | "catalog.product.image". */
  field: string;
  defaultImageId: string | null;
  defaultImageUrl: string | null;
  label?: string;
}) {
  const [selectedId, setSelectedId] = useState(defaultImageId ?? "");
  const [selectedUrl, setSelectedUrl] = useState<string | null>(defaultImageUrl);
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAssets = useCallback(async (): Promise<AssetRow[]> => {
    setLoading(true);
    try {
      const res = await fetch("/admin-api/assets", { cache: "no-store" });
      if (!res.ok) return [];
      const list = (await res.json()) as AssetRow[];
      setAssets(list);
      return list;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  function openPicker() {
    setOpen(true);
    void loadAssets();
  }

  const onApply = useCallback(
    async (ref: MediaRef) => {
      if (ref.type !== "image") return;
      setSelectedId(ref.assetId);
      setOpen(false);
      // Resolve the preview URL. A freshly UPLOADED asset isn't in the current
      // list yet, so refetch (awaited) to pick up its URL.
      const known = assets.find((a) => a.id === ref.assetId);
      if (known) {
        setSelectedUrl(known.url);
        return;
      }
      const fresh = await loadAssets();
      setSelectedUrl(fresh.find((a) => a.id === ref.assetId)?.url ?? null);
    },
    [assets, loadAssets],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <input type="hidden" name={name} value={selectedId} />

      <div className="flex items-center gap-3">
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          {selectedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external MinIO host; preview
            <img src={selectedUrl} alt="" className="size-full object-cover" />
          ) : (
            <ImageOff className="size-5 text-muted-foreground/60" aria-hidden />
          )}
        </span>

        <div className="flex flex-col items-start gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={openPicker}
          >
            <ImagePlus aria-hidden />
            {selectedId ? "Change image" : "Choose image"}
          </Button>
          {selectedId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-muted-foreground hover:text-destructive"
              onClick={() => {
                setSelectedId("");
                setSelectedUrl(null);
              }}
            >
              <X aria-hidden />
              Remove
            </Button>
          )}
        </div>
      </div>

      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        target={{ field, mediaKind: "image" }}
        assets={assets}
        assetsLoading={loading}
        saving={false}
        onAssetsRefresh={() => void loadAssets()}
        onApply={onApply}
      />
    </div>
  );
}
