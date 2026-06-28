"use client";

// app/(dash)/visual/crop-view.tsx
// The Upload-tab crop step. Wraps react-easy-crop (headless — only the crop/zoom/rotate surface) in
// our own shadcn chrome: a zoom Slider, a 90° rotate button, aspect-ratio presets, and the actions.
// It does NOT upload — it produces a cropped Blob via getCroppedImg and hands it to the parent
// (onCrop), or asks the parent to upload the original un-cropped (onUseFull). Lazy-loaded by the
// dialog so react-easy-crop stays out of the initial bundle.

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { RotateCw, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getCroppedImg } from "@/app/lib/crop-image";
import { ASPECT_PRESETS, defaultPresetId } from "./aspect-presets";

interface CropViewProps {
  file: File; // for output mime + filename
  imageUrl: string; // object URL owned by the parent (created on pick, revoked on clear)
  field?: string;
  uploading: boolean; // presign→PUT→confirm in flight
  saving: boolean; // controller applyRef PUT in flight (after upload)
  uploadStatus: string | null; // human label for the current upload phase
  uploadError: string | null; // error from the parent's upload
  progressPct?: number | null; // 0–100 during the R2 PUT → renders a progress bar
  onCancel: () => void;
  onUseFull: () => void;
  onCrop: (blob: Blob) => void;
}

export function CropView({
  file,
  imageUrl,
  field,
  uploading,
  saving,
  uploadStatus,
  uploadError,
  progressPct,
  onCancel,
  onUseFull,
  onCrop,
}: CropViewProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [presetId, setPresetId] = useState(() => defaultPresetId(field));
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const [pixels, setPixels] = useState<Area | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const preset = ASPECT_PRESETS.find((p) => p.id === presetId) ?? ASPECT_PRESETS[0];
  const aspect = preset.ratio ?? naturalRatio ?? 4 / 3;

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => setPixels(areaPixels), []);

  async function handleCrop() {
    if (!pixels) return;
    setExporting(true);
    setExportError(null);
    try {
      const blob = await getCroppedImg(imageUrl, pixels, rotation, file.type);
      onCrop(blob); // parent uploads; upload errors come back via uploadError
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Could not prepare the crop.");
    } finally {
      setExporting(false);
    }
  }

  const busy = uploading || saving || exporting;
  const error = uploadError ?? exportError;
  const statusLine = exporting ? "Preparing crop…" : uploading ? uploadStatus : saving ? "Saving…" : null;
  const cropLabel = saving ? "Saving…" : uploading ? "Uploading…" : exporting ? "Cropping…" : "Crop & upload";

  return (
    <div className="flex flex-col gap-4">
      {/* Crop surface */}
      <div className="relative h-[clamp(260px,46vh,440px)] w-full overflow-hidden rounded-xl border border-border bg-muted">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspect}
          minZoom={1}
          maxZoom={4}
          restrictPosition
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={onCropComplete}
          onMediaLoaded={(m) => setNaturalRatio(m.naturalWidth / m.naturalHeight)}
          cropperProps={{
            "aria-label": "Crop area — drag to reposition; once focused, use arrow keys for fine moves",
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Drag the image to reposition, zoom with the slider, and pick a ratio. Or keep the whole image.
      </p>

      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground">Zoom</span>
          <Slider
            value={[zoom]}
            min={1}
            max={4}
            step={0.01}
            onValueChange={([z]) => setZoom(z)}
            aria-label="Zoom"
            disabled={busy}
            className="flex-1"
          />
          <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {zoom.toFixed(1)}×
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            disabled={busy}
          >
            <RotateCw className="size-4" />
            Rotate
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground">Ratio</span>
          <ToggleGroup
            type="single"
            value={presetId}
            onValueChange={(v) => v && setPresetId(v)}
            aria-label="Aspect ratio"
            disabled={busy}
          >
            {ASPECT_PRESETS.map((p) => (
              <ToggleGroupItem key={p.id} value={p.id} aria-label={p.label}>
                {p.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {/* Status / error */}
      {statusLine && (
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-primary">
          <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          {statusLine}
        </p>
      )}
      {uploading && progressPct != null && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {progressPct}%
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-3">
        <Button type="button" variant="ghost" onClick={onUseFull} disabled={busy} className="mr-auto">
          <Maximize className="size-4" />
          Use full image
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" onClick={handleCrop} disabled={busy || !pixels}>
          {cropLabel}
        </Button>
      </div>
    </div>
  );
}
