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
// and threads it into onApply's payload — `{ media?: MediaRef; overlay?: Overlay }`. `media` absent
// means "keep the current media, only the overlay changed", which is what makes an overlay-only
// edit possible: Apply no longer requires a freshly picked image/video. Every overlay control ALSO
// calls the optional `onOverlayPreview` prop with that same next value, so the actual preview page
// updates live as the user drags; closing the dialog — Cancel, Escape, a backdrop click, or the
// header's X, all routed through the dialog root's closeDialog — calls it once more with
// `initialOverlay` to revert.
// ImageBody/VideoBody carry the working `overlay` and a `flexible` flag only to shape their Apply
// button/payload — the non-flexible standalone renders never receive either, so their onApply
// payload always carries `overlay: undefined`, same net effect as before this payload existed.
//
// Uploads (Upload tab + the video sub-pickers) reuse uploadAsset() (presign → PUT → confirm,
// content-addressed dedup). "Use full image" and SVGs upload the original bytes so they dedup
// exactly; a re-encoded crop (canvas toBlob) is best-effort dedup (bytes aren't guaranteed stable
// across engines). Replaces the former edit-drawer.tsx and re-exports its contracts.

import { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { UploadCloud, ImageUp } from "lucide-react";
import type { Overlay } from "@signex/shared";
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
import { OverlayField } from "./overlay-field";

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

/** onApply/applyMediaRef's payload shape — shared by every caller (this dialog's own bodies,
 *  editor-shell's applyMediaRef, catalog-image-picker's onApply) so the shape can't drift between
 *  them. `media` present → change the media; absent → keep the current media unchanged. `overlay`
 *  is only ever non-undefined when the target is flexible (see the OVERLAY note above). */
export interface MediaApplyPayload {
  media?: MediaRef;
  overlay?: Overlay;
}

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
  /** `media` present → change the media; absent → keep the current media unchanged (an
   *  overlay-only Apply). `overlay` is only ever non-undefined when `flexible` — FlexibleBody is
   *  the sole caller that populates it; the non-flexible ImageBody/VideoBody paths always send
   *  `overlay: undefined`. */
  onApply: (payload: MediaApplyPayload) => void;
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
  /** Live-preview sink for the "Lớp phủ" section, when `flexible` — called with the working
   *  overlay on every control change (drag included) so the ACTUAL preview page updates as-you-go,
   *  and once more with `initialOverlay` whenever the dialog closes (Cancel, Escape, backdrop, or
   *  the header's X — see closeDialog below) to put it back. The live-drag calls are threaded
   *  straight to FlexibleBody, so only flexible sessions make those; the close-time call fires
   *  regardless of `flexible` (the shell's previewOverlay guards on `mediaTarget?.flexible` itself,
   *  so it's a harmless no-op then). */
  onOverlayPreview?: (overlay: Overlay | undefined) => void;
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
  overlay,
  flexible,
}: {
  target: EditTarget;
  assets: AssetRow[];
  assetsLoading: boolean;
  saving: boolean;
  onAssetsRefresh: () => void;
  onApply: (payload: MediaApplyPayload) => void;
  onCancel: () => void;
  /** The FlexibleBody-owned working "Lớp phủ" value, along for the ride on every Apply. Undefined
   *  outside a flexible body (the non-flexible standalone render never passes it), so Apply then
   *  always sends `overlay: undefined` — the exact pre-existing payload, just reshaped. */
  overlay?: Overlay;
  /** True when rendered inside FlexibleBody. A Library click SELECTS instead of immediately
   *  applying (Apply is what commits, so the user can still touch the overlay first), and Apply is
   *  enabled with nothing selected (an overlay-only commit). Undefined/false reproduces the exact
   *  pre-existing behavior. */
  flexible?: boolean;
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
      onApply({ media: { type: "image", assetId: asset.id }, overlay }); // controller saves + closes on success
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
            onActivate={(a) => {
              if (locked) return;
              // Flexible: a click SELECTS only — Apply is what commits, so a still-unsaved overlay
              // tweak isn't discarded by a double-click's immediate-apply shortcut. Non-flexible
              // keeps that shortcut, unchanged.
              if (flexible) setSelected(a);
              else onApply({ media: { type: "image", assetId: a.id }, overlay });
            }}
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
        <PickerFooter
          helper={
            selected
              ? selected.originalName
              : flexible
                ? "Chọn ảnh, hoặc chỉ chỉnh lớp phủ rồi Áp dụng."
                : "Pick an image, or switch to Upload."
          }
        >
          <Button type="button" variant="ghost" onClick={onCancel} disabled={locked}>
            Huỷ
          </Button>
          <Button
            type="button"
            disabled={flexible ? locked : !selected || locked}
            onClick={() =>
              onApply({
                media: selected ? { type: "image", assetId: selected.id } : undefined,
                overlay,
              })
            }
          >
            {saving ? "Saving…" : "Áp dụng"}
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
                Huỷ
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
  overlay,
  flexible,
}: {
  assets: AssetRow[];
  saving: boolean;
  onAssetsRefresh: () => void;
  onApply: (payload: MediaApplyPayload) => void;
  onCancel: () => void;
  /** See ImageBody's identical prop — the same working "Lớp phủ" value, along for the ride. */
  overlay?: Overlay;
  /** See ImageBody's identical prop. Video has no "select then Apply" step to gate — poster/mp4/
   *  webm are already picked via the sub-pickers below — so this only relaxes the Apply button's
   *  disabled rule, allowing an overlay-only commit before a complete video is chosen. */
  flexible?: boolean;
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
          Huỷ
        </Button>
        <Button
          type="button"
          disabled={flexible ? saving : !canApply || saving}
          onClick={() =>
            onApply({
              media: canApply
                ? {
                    type: "video",
                    posterAssetId: posterId,
                    mp4AssetId: mp4Id,
                    ...(webmId ? { webmAssetId: webmId } : {}),
                  }
                : undefined,
              overlay,
            })
          }
        >
          {saving ? "Saving…" : "Áp dụng"}
        </Button>
      </PickerFooter>
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
// `overlay` rides along on Apply inside onApply's payload (`{ media?, overlay }`, passed straight
// through to ImageBody/VideoBody's own `overlay` prop) — it is never WRITTEN (saved) anywhere until
// then, same as `kind`. It IS, however, live-PREVIEWED before that: every control below also calls
// `onOverlayPreview` with the same next value; closing the dialog (Cancel, Escape, backdrop, or the
// header's X — MediaPickerDialog's closeDialog wraps every one of them) calls it once more with
// `initialOverlay` to put the actual preview page back the way it found it.
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
  onOverlayPreview,
}: {
  target: EditTarget;
  defaultKind: "image" | "video";
  assets: AssetRow[];
  assetsLoading: boolean;
  saving: boolean;
  onAssetsRefresh: () => void;
  onApply: (payload: MediaApplyPayload) => void;
  onCancel: () => void;
  initialOverlay?: Overlay;
  onOverlayPreview?: (overlay: Overlay | undefined) => void;
}) {
  const [kind, setKind] = useState<"image" | "video">(defaultKind);
  const [overlay, setOverlay] = useState<Overlay | undefined>(initialOverlay);
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

      {/* Lớp phủ — an optional colour/gradient wash over whichever media is chosen below. Local
          state (see the section comment above FlexibleBody) that ALSO streams live to the actual
          preview page via onOverlayPreview on every change below, while only reaching `pending`
          (the saved value) once, on Apply — inside onApply's payload, alongside whichever MediaRef
          (or none) the user chose. */}
      <OverlayField
        value={overlay}
        onChange={(next) => {
          setOverlay(next);
          onOverlayPreview?.(next);
        }}
      />

      {kind === "video" ? (
        <VideoBody
          assets={assets}
          saving={saving}
          onAssetsRefresh={onAssetsRefresh}
          onApply={onApply}
          onCancel={onCancel}
          overlay={overlay}
          flexible
        />
      ) : (
        <ImageBody
          target={target}
          assets={assets}
          assetsLoading={assetsLoading}
          saving={saving}
          onAssetsRefresh={onAssetsRefresh}
          onApply={onApply}
          onCancel={onCancel}
          overlay={overlay}
          flexible
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
  onOverlayPreview,
}: Props) {
  const isVideo = target?.mediaKind === "video";
  const friendly = target ? fieldLabel(target.field) : null;
  // `target.mediaKind` is hard-coded "image" for every flexible slot (the overlay's hasCap check
  // tries "image" first), so it says nothing about which kind is actually stored — the title reads
  // `defaultKind` (the caller's pickerDefaultKind, which DOES know the stored/posted kind) instead,
  // whenever the target is flexible.
  const titleIsVideo = flexible ? (defaultKind ?? target?.mediaKind) === "video" : isVideo;
  // Every close path — Escape, a backdrop click, the header's X, and the footer Cancel button — must
  // revert the live "Lớp phủ" preview the same way, or the iframe is left showing an uncommitted
  // drag. Routing ALL of them through this one function (rather than only Cancel, as before) is what
  // makes that true. onOverlayPreview is a no-op for a non-flexible target (previewOverlay in the
  // shell guards on mediaTarget?.flexible), so no extra guard is needed here.
  const closeDialog = (nextOpen: boolean) => {
    if (!nextOpen) onOverlayPreview?.(initialOverlay);
    onOpenChange(nextOpen);
  };
  return (
    <Dialog open={open} onOpenChange={closeDialog}>
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
              onCancel={() => closeDialog(false)}
              initialOverlay={initialOverlay}
              onOverlayPreview={onOverlayPreview}
            />
          ) : isVideo ? (
            <VideoBody
              key={target.field}
              assets={assets}
              saving={saving}
              onAssetsRefresh={onAssetsRefresh}
              onApply={onApply}
              onCancel={() => closeDialog(false)}
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
              onCancel={() => closeDialog(false)}
            />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
