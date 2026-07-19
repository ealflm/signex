"use client";

// app/(dash)/visual/media-picker-dialog.tsx
// The media picker opened when a media zone is clicked in the visual editor. A centered Dialog with,
// for an IMAGE target, two tabs — Library (pick an existing asset) and Upload (drop a file → crop /
// zoom / rotate → upload). For a VIDEO target it shows three sub-pickers (poster / mp4 / webm), no
// crop. Whatever the path, it resolves a MediaRef and hands it to onApply — the controller
// (visual-editor.tsx applyRef) does the GET → merge → PUT save, unchanged.
//
// OVERLAY. The four flexible slots also carry an optional colour/gradient wash (@signex/shared's
// Overlay). FlexibleBody owns that as local state (a "Lớp phủ" section below its Ảnh/Video toggle)
// and passes it as onApply's SECOND, optional argument — never a payload object, so a caller typed
// `(ref: MediaRef) => void` (any non-flexible picker) stays source-compatible with no changes.
// ImageBody/VideoBody know nothing about it; they only ever call `onApply(ref)`.
//
// Uploads (Upload tab + the video sub-pickers) reuse uploadAsset() (presign → PUT → confirm,
// content-addressed dedup). "Use full image" and SVGs upload the original bytes so they dedup
// exactly; a re-encoded crop (canvas toBlob) is best-effort dedup (bytes aren't guaranteed stable
// across engines). Replaces the former edit-drawer.tsx and re-exports its contracts.

import { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { UploadCloud, ImageUp } from "lucide-react";
import { overlayCss, type Overlay } from "@signex/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/admin/field";
import { cn } from "@/lib/utils";
import { uploadAsset, type UploadPhase } from "@/app/lib/upload-asset";
import { AssetGrid } from "./asset-grid";
import { fieldLabel } from "./aspect-presets";
// Aliased: FlexibleBody already has a local `kind`/`setKind` pair for the Ảnh/Video toggle, so the
// pure "none"|"solid"|"gradient" setter import needs a distinct name in this file.
import { setKind as setOverlayKind, addStop, removeStop } from "./overlay-edit";

// CropView is lazy-loaded so react-easy-crop stays out of the initial bundle (only the Upload→crop
// path needs it). It's a client-only surface — no SSR.
const CropView = dynamic(() => import("./crop-view").then((m) => m.CropView), { ssr: false });

export interface AssetRow {
  id: string;
  kind: string; // IMAGE | VIDEO | SVG
  url: string;
  originalName: string;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  status?: string;
}

/** AssetRef (image) or VideoRef (video) the picker resolves and hands back. */
export type MediaRef =
  | { type: "image"; assetId: string }
  | { type: "video"; posterAssetId: string; mp4AssetId: string; webmAssetId?: string };

export interface EditTarget {
  field: string; // "<blockKey>.<path>", e.g. "hero.image" / "features.video.media"
  mediaKind: "image" | "video";
  /** True when the clicked slot carries both the image AND video caps (Task 7) — the picker offers
   *  the Ảnh/Video toggle only then (Task 9). Undefined/false for a single-kind slot (e.g. a logo). */
  flexible?: boolean;
}

interface Props {
  open: boolean;
  target: EditTarget | null;
  assets: AssetRow[];
  assetsLoading: boolean;
  saving: boolean; // the controller's applyRef PUT is in flight
  onAssetsRefresh: () => void;
  /** `overlay` is the working value from the "Lớp phủ" section (undefined = none picked). Only
   *  ever populated when `flexible` — FlexibleBody is the sole caller that passes a second
   *  argument; the non-flexible ImageBody/VideoBody paths call `onApply(ref)` with none, which
   *  this signature accepts unchanged (the parameter is optional). */
  onApply: (ref: MediaRef, overlay?: Overlay) => void;
  onOpenChange: (open: boolean) => void;
  /** True when the target slot accepts EITHER kind (Task 7's overlay flag, threaded through
   *  editor-shell) — renders the Ảnh/Video toggle above the body. Undefined/false renders exactly
   *  today's single-kind body for `target.mediaKind`, unchanged. */
  flexible?: boolean;
  /** Which side the toggle opens on when `flexible`: the field's CURRENT stored kind, else the
   *  posted mediaKind (the caller computes this with pickerDefaultKind). Ignored otherwise. */
  defaultKind?: "image" | "video";
  /** The field's CURRENT stored overlay, when `flexible` — FlexibleBody's initial working value
   *  for the "Lớp phủ" section. Undefined defaults the section to "Không" (no overlay). Ignored
   *  when `flexible` is false (the section never renders then). */
  initialOverlay?: Overlay;
}

const IMAGE_KINDS = ["IMAGE", "SVG"];
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml";

// Plain-language upload phases (no engineer jargon in the editor UI).
const PHASE_LABEL: Record<UploadPhase, string> = {
  hashing: "Preparing…",
  presigning: "Preparing…",
  uploading: "Uploading…",
  confirming: "Finishing…",
  done: "Uploaded.",
};

// Files we upload as-is instead of routing through the cropper: SVG is vector and GIF is (possibly)
// animated — rasterizing either in a canvas would corrupt it (flatten the animation / lose vectors).
function skipCrop(file: File): boolean {
  const t = file.type;
  const n = file.name.toLowerCase();
  return t === "image/svg+xml" || n.endsWith(".svg") || t === "image/gif" || n.endsWith(".gif");
}

// Shared footer row so every tab/state aligns identically.
function PickerFooter({ helper, children }: { helper?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-6 py-4">
      {helper != null && <span className="mr-auto truncate text-xs text-muted-foreground">{helper}</span>}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image body — Library + Upload tabs
// ---------------------------------------------------------------------------
function ImageBody({
  target,
  assets,
  assetsLoading,
  saving,
  onAssetsRefresh,
  onApply,
  onCancel,
}: {
  target: EditTarget;
  assets: AssetRow[];
  assetsLoading: boolean;
  saving: boolean;
  onAssetsRefresh: () => void;
  onApply: (ref: MediaRef) => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState("library");
  const [selected, setSelected] = useState<AssetRow | null>(null);

  // Upload-tab state. The object URL is created here (in the pick event handler) and revoked in a
  // side-effect-free cleanup — keeping CropView pure and avoiding a setState-in-effect URL dance.
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState<UploadPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!picked) return;
    return () => URL.revokeObjectURL(picked.url);
  }, [picked]);

  const locked = uploading || saving; // block all picker actions while a save round-trip is in flight

  async function doUpload(toUpload: File) {
    if (uploading) return; // guard against a second upload during an in-flight one
    setUploading(true);
    setError(null);
    try {
      const asset = await uploadAsset(toUpload, setPhase);
      onAssetsRefresh();
      onApply({ type: "image", assetId: asset.id }); // controller saves + closes on success
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      setPhase(null);
    }
  }

  function onChosen(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (!f.type.startsWith("image/")) {
      setError("That's not an image. Choose a PNG, JPG, WebP, AVIF, GIF or SVG.");
      return;
    }
    if (skipCrop(f)) void doUpload(f); // vector / animated — upload as-is
    else setPicked({ file: f, url: URL.createObjectURL(f) }); // → CropView
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="px-6">
        <TabsList>
          <TabsTrigger value="library" disabled={locked}>
            Library
          </TabsTrigger>
          <TabsTrigger value="upload" disabled={locked}>
            Upload
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Library */}
      <TabsContent value="library" className="flex min-h-0 flex-1 flex-col gap-0 data-[state=inactive]:hidden">
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <AssetGrid
            assets={assets}
            kinds={IMAGE_KINDS}
            loading={assetsLoading}
            selectedId={selected?.id ?? ""}
            onSelect={setSelected}
            onActivate={(a) => !locked && onApply({ type: "image", assetId: a.id })}
            emptySlot={
              <button
                type="button"
                onClick={() => setTab("upload")}
                className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <ImageUp className="size-6" aria-hidden />
                No images yet — upload one
              </button>
            }
          />
        </div>
        <PickerFooter helper={selected ? selected.originalName : "Pick an image, or switch to Upload."}>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={locked}>
            Cancel
          </Button>
          <Button type="button" disabled={!selected || locked} onClick={() => selected && onApply({ type: "image", assetId: selected.id })}>
            {saving ? "Saving…" : "Use image"}
          </Button>
        </PickerFooter>
      </TabsContent>

      {/* Upload */}
      <TabsContent value="upload" className="flex min-h-0 flex-1 flex-col gap-0 data-[state=inactive]:hidden">
        {picked ? (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <CropView
              file={picked.file}
              imageUrl={picked.url}
              field={target.field}
              uploading={uploading}
              saving={saving}
              uploadStatus={phase ? PHASE_LABEL[phase] : null}
              uploadError={error}
              onCancel={() => {
                setPicked(null);
                setError(null);
              }}
              onUseFull={() => void doUpload(picked.file)}
              onCrop={(blob) =>
                void doUpload(
                  new File(
                    [blob],
                    `crop_${picked.file.name.replace(/\.[^.]+$/, "")}.${blob.type.split("/")[1] ?? "jpg"}`,
                    { type: blob.type },
                  ),
                )
              }
            />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <button
                type="button"
                onClick={() => !locked && inputRef.current?.click()}
                disabled={locked}
                onDragOver={(e) => {
                  if (locked) return;
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (!locked) onChosen(e.dataTransfer.files?.[0]);
                }}
                className={[
                  "flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors disabled:opacity-60",
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                ].join(" ")}
              >
                <UploadCloud className="size-8 text-muted-foreground" aria-hidden />
                <span className="text-sm font-medium text-foreground">Drop an image here, or click to browse</span>
                <span className="text-xs text-muted-foreground">
                  PNG, JPG, WebP, AVIF, GIF or SVG. You can crop after choosing (SVG &amp; GIF upload as-is).
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={IMAGE_ACCEPT}
                hidden
                disabled={locked}
                onChange={(e) => {
                  onChosen(e.target.files?.[0]);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              />
              {uploading && phase && (
                <p role="status" aria-live="polite" className="mt-3 flex items-center gap-2 text-sm text-primary">
                  <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                  {PHASE_LABEL[phase]}
                </p>
              )}
              {error && (
                <p role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <PickerFooter>
              <Button type="button" variant="ghost" onClick={onCancel} disabled={locked}>
                Cancel
              </Button>
            </PickerFooter>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Video body — poster + mp4 (+ optional webm), no crop
// ---------------------------------------------------------------------------
function VideoSubPicker({
  label,
  allowVideo,
  assets,
  value,
  onChange,
  onUploaded,
}: {
  label: string;
  allowVideo: boolean;
  assets: AssetRow[];
  value: string;
  onChange: (id: string) => void;
  onUploaded: () => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options = assets.filter((a) => (allowVideo ? a.kind === "VIDEO" : IMAGE_KINDS.includes(a.kind)));
  const selected = options.find((a) => a.id === value);
  const accept = allowVideo
    ? "video/mp4,video/webm"
    : "image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml";

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      const a = await uploadAsset(f, (p) => setStatus(PHASE_LABEL[p]));
      onUploaded();
      onChange(a.id);
      setStatus(`Uploaded ${a.originalName}.`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Upload failed.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field label={label} htmlFor={`pick-${id}`}>
      <div className="flex flex-col gap-2">
        {selected && !allowVideo && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary R2/MinIO origin; no loader
          <img src={selected.url} alt="" className="h-24 w-full rounded-md border border-border object-cover" />
        )}
        <select
          id={`pick-${id}`}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">No asset</option>
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.originalName}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <input ref={inputRef} type="file" accept={accept} hidden onChange={onFile} disabled={busy} />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? "Uploading…" : "Upload new…"}
          </Button>
          {status && <span className="text-xs text-muted-foreground">{status}</span>}
        </div>
        {err && (
          <p className="text-xs text-destructive" role="alert">
            {err}
          </p>
        )}
      </div>
    </Field>
  );
}

function VideoBody({
  assets,
  saving,
  onAssetsRefresh,
  onApply,
  onCancel,
}: {
  assets: AssetRow[];
  saving: boolean;
  onAssetsRefresh: () => void;
  onApply: (ref: MediaRef) => void;
  onCancel: () => void;
}) {
  const [posterId, setPosterId] = useState("");
  const [mp4Id, setMp4Id] = useState("");
  const [webmId, setWebmId] = useState("");
  const canApply = Boolean(posterId && mp4Id);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <VideoSubPicker label="Poster image" allowVideo={false} assets={assets} value={posterId} onChange={setPosterId} onUploaded={onAssetsRefresh} />
          <VideoSubPicker label="MP4 video" allowVideo assets={assets} value={mp4Id} onChange={setMp4Id} onUploaded={onAssetsRefresh} />
          <VideoSubPicker label="WebM video (optional)" allowVideo assets={assets} value={webmId} onChange={setWebmId} onUploaded={onAssetsRefresh} />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          A video needs at least a poster and an MP4. WebM is optional. Captions and other text stay in
          the content editor.
        </p>
      </div>
      <PickerFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!canApply || saving}
          onClick={() => onApply({ type: "video", posterAssetId: posterId, mp4AssetId: mp4Id, ...(webmId ? { webmAssetId: webmId } : {}) })}
        >
          {saving ? "Saving…" : "Use video"}
        </Button>
      </PickerFooter>
    </div>
  );
}

// A small preview swatch for the "Lớp phủ" section: a checkerboard backdrop (color-panel.tsx's
// Swatch recipe — `bg-[repeating-conic-gradient(…)]`) so a translucent fill reads as translucent,
// not as a lighter opaque colour sitting on the panel's flat background. The inner div is styled
// by overlayCss — the SAME resolver the public site and the live preview use — so what this box
// shows is exactly what the overlay will render as, "Không" included (overlayCss(undefined) = {},
// i.e. bare checkerboard).
function OverlayPreview({ overlay }: { overlay: Overlay | undefined }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Xem trước</span>
      <div
        aria-hidden
        className="relative h-16 w-full overflow-hidden rounded-md border border-border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:8px_8px]"
      >
        <div className="absolute inset-0" style={overlayCss(overlay)} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flexible body — an Ảnh/Video segmented toggle above the image or video body, for the four slots
// that accept either kind (hero.image, features.featured.image, features.video.media,
// aboutPage.hero.video). The toggle reuses the toolbar's locale-switcher recipe (rounded-md border
// + bg-primary on the active side) — the project's existing 2-option segmented control, not a new
// pattern. `key={target.field}` on the caller resets `kind` to `defaultKind` whenever a DIFFERENT
// field opens; toggling within one open session is local state only — it never touches what's
// saved until Apply, and onApply/buildMediaValue (media-apply.ts) still decide the actual write.
//
// Same key also owns the "Lớp phủ" overlay section's `overlay` state — the same field-change reset
// applies (a fresh field starts from ITS OWN `initialOverlay`, never the previous field's edits),
// with no effect needed since the reset is really the whole component remounting under a new key.
// `overlay` rides along on Apply as onApply's second argument (see applyWithOverlay below); it is
// never written anywhere until then, same as `kind`.
// ---------------------------------------------------------------------------
function FlexibleBody({
  target,
  defaultKind,
  assets,
  assetsLoading,
  saving,
  onAssetsRefresh,
  onApply,
  onCancel,
  initialOverlay,
}: {
  target: EditTarget;
  defaultKind: "image" | "video";
  assets: AssetRow[];
  assetsLoading: boolean;
  saving: boolean;
  onAssetsRefresh: () => void;
  onApply: (ref: MediaRef, overlay?: Overlay) => void;
  onCancel: () => void;
  initialOverlay?: Overlay;
}) {
  const [kind, setKind] = useState<"image" | "video">(defaultKind);
  const [overlay, setOverlay] = useState<Overlay | undefined>(initialOverlay);
  // Injects the CURRENT overlay into every onApply call this body's children make, without either
  // of them knowing overlay exists — ImageBody/VideoBody keep calling `onApply(ref)` unchanged.
  const applyWithOverlay = (ref: MediaRef) => onApply(ref, overlay);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="px-6 pb-3">
        <div
          role="group"
          aria-label="Loại nội dung"
          className="inline-flex items-center rounded-md border border-input bg-background p-0.5"
        >
          <button
            type="button"
            aria-pressed={kind === "image"}
            onClick={() => setKind("image")}
            className={cn(
              "rounded px-3 py-1 text-xs font-medium transition-colors",
              kind === "image"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Ảnh
          </button>
          <button
            type="button"
            aria-pressed={kind === "video"}
            onClick={() => setKind("video")}
            className={cn(
              "rounded px-3 py-1 text-xs font-medium transition-colors",
              kind === "video"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Video
          </button>
        </div>
      </div>

      {/* Lớp phủ — an optional colour/gradient wash over whichever media is chosen below. Purely
          local state (see the section comment above FlexibleBody); it travels up only via
          applyWithOverlay, at the same moment the chosen MediaRef does. */}
      <div className="mx-6 mb-3 flex flex-col gap-3 rounded-md border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">Lớp phủ</span>
          <div
            role="group"
            aria-label="Lớp phủ"
            className="inline-flex items-center rounded-md border border-input bg-background p-0.5"
          >
            <button
              type="button"
              aria-pressed={overlay === undefined}
              onClick={() => setOverlay(setOverlayKind(overlay, "none"))}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                overlay === undefined
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Không
            </button>
            <button
              type="button"
              aria-pressed={overlay?.kind === "solid"}
              onClick={() => setOverlay(setOverlayKind(overlay, "solid"))}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                overlay?.kind === "solid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Màu đặc
            </button>
            <button
              type="button"
              aria-pressed={overlay?.kind === "gradient"}
              onClick={() => setOverlay(setOverlayKind(overlay, "gradient"))}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                overlay?.kind === "gradient"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Gradient
            </button>
          </div>
        </div>

        {overlay?.kind === "solid" && (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={overlay.fill.color}
              onChange={(e) =>
                setOverlay((o) =>
                  o?.kind === "solid" ? { ...o, fill: { ...o.fill, color: e.target.value } } : o,
                )
              }
              aria-label="Màu lớp phủ"
              className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input p-0.5"
            />
            <span className="shrink-0 text-xs text-muted-foreground">Độ mờ</span>
            <input
              type="range"
              min={0}
              max={100}
              value={overlay.fill.opacity}
              onChange={(e) =>
                setOverlay((o) =>
                  o?.kind === "solid"
                    ? { ...o, fill: { ...o.fill, opacity: Number(e.target.value) } }
                    : o,
                )
              }
              aria-label="Độ mờ lớp phủ"
              className="min-w-0 flex-1"
            />
            <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {overlay.fill.opacity}%
            </span>
          </div>
        )}

        {overlay?.kind === "gradient" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-muted-foreground">Góc</span>
              <input
                type="range"
                min={0}
                max={360}
                value={overlay.angle}
                onChange={(e) =>
                  setOverlay((o) =>
                    o?.kind === "gradient" ? { ...o, angle: Number(e.target.value) } : o,
                  )
                }
                aria-label="Góc gradient"
                className="min-w-0 flex-1"
              />
              <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                {overlay.angle}°
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {overlay.stops.map((stop, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md border border-border/60 p-2"
                >
                  <input
                    type="color"
                    value={stop.color}
                    onChange={(e) =>
                      setOverlay((o) =>
                        o?.kind === "gradient"
                          ? {
                              ...o,
                              stops: o.stops.map((s, idx) =>
                                idx === i ? { ...s, color: e.target.value } : s,
                              ),
                            }
                          : o,
                      )
                    }
                    aria-label={`Màu điểm dừng ${i + 1}`}
                    className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-input p-0.5"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-9 shrink-0 text-[11px] text-muted-foreground">Độ mờ</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={stop.opacity}
                        onChange={(e) =>
                          setOverlay((o) =>
                            o?.kind === "gradient"
                              ? {
                                  ...o,
                                  stops: o.stops.map((s, idx) =>
                                    idx === i ? { ...s, opacity: Number(e.target.value) } : s,
                                  ),
                                }
                              : o,
                          )
                        }
                        aria-label={`Độ mờ điểm dừng ${i + 1}`}
                        className="min-w-0 flex-1"
                      />
                      <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                        {stop.opacity}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-9 shrink-0 text-[11px] text-muted-foreground">Vị trí</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={stop.pos}
                        onChange={(e) =>
                          setOverlay((o) =>
                            o?.kind === "gradient"
                              ? {
                                  ...o,
                                  stops: o.stops.map((s, idx) =>
                                    idx === i ? { ...s, pos: Number(e.target.value) } : s,
                                  ),
                                }
                              : o,
                          )
                        }
                        aria-label={`Vị trí điểm dừng ${i + 1}`}
                        className="min-w-0 flex-1"
                      />
                      <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                        {stop.pos}%
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={overlay.stops.length <= 2}
                    onClick={() => setOverlay((o) => removeStop(o, i))}
                    aria-label={`Xoá điểm dừng ${i + 1}`}
                    className="shrink-0 text-muted-foreground"
                  >
                    Xoá
                  </Button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={overlay.stops.length >= 4}
              onClick={() => setOverlay((o) => addStop(o))}
              className="self-start"
            >
              + Thêm điểm
            </Button>
          </div>
        )}

        <OverlayPreview overlay={overlay} />
      </div>

      {kind === "video" ? (
        <VideoBody
          assets={assets}
          saving={saving}
          onAssetsRefresh={onAssetsRefresh}
          onApply={applyWithOverlay}
          onCancel={onCancel}
        />
      ) : (
        <ImageBody
          target={target}
          assets={assets}
          assetsLoading={assetsLoading}
          saving={saving}
          onAssetsRefresh={onAssetsRefresh}
          onApply={applyWithOverlay}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog shell
// ---------------------------------------------------------------------------
export function MediaPickerDialog({
  open,
  target,
  assets,
  assetsLoading,
  saving,
  onAssetsRefresh,
  onApply,
  onOpenChange,
  flexible = false,
  defaultKind,
  initialOverlay,
}: Props) {
  const isVideo = target?.mediaKind === "video";
  const friendly = target ? fieldLabel(target.field) : null;
  // `target.mediaKind` is hard-coded "image" for every flexible slot (the overlay's hasCap check
  // tries "image" first), so it says nothing about which kind is actually stored — the title reads
  // `defaultKind` (the caller's pickerDefaultKind, which DOES know the stored/posted kind) instead,
  // whenever the target is flexible.
  const titleIsVideo = flexible ? (defaultKind ?? target?.mediaKind) === "video" : isVideo;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(64rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="px-6 pb-3 pt-6">
          <DialogTitle>{titleIsVideo ? "Replace video" : "Replace image"}</DialogTitle>
          <DialogDescription>
            {!target ? (
              "Pick an existing asset or upload a new one."
            ) : friendly ? (
              `Editing the ${friendly.toLowerCase()}.`
            ) : (
              <>
                Editing{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{target.field}</code>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {target ? (
          flexible ? (
            <FlexibleBody
              key={target.field}
              target={target}
              defaultKind={defaultKind ?? (isVideo ? "video" : "image")}
              assets={assets}
              assetsLoading={assetsLoading}
              saving={saving}
              onAssetsRefresh={onAssetsRefresh}
              onApply={onApply}
              onCancel={() => onOpenChange(false)}
              initialOverlay={initialOverlay}
            />
          ) : isVideo ? (
            <VideoBody
              key={target.field}
              assets={assets}
              saving={saving}
              onAssetsRefresh={onAssetsRefresh}
              onApply={onApply}
              onCancel={() => onOpenChange(false)}
            />
          ) : (
            <ImageBody
              key={target.field}
              target={target}
              assets={assets}
              assetsLoading={assetsLoading}
              saving={saving}
              onAssetsRefresh={onAssetsRefresh}
              onApply={onApply}
              onCancel={() => onOpenChange(false)}
            />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
