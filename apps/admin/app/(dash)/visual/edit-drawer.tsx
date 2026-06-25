"use client";

// app/(dash)/visual/edit-drawer.tsx
// The media edit drawer (shadcn Sheet) opened by the visual editor controller when the user clicks
// a media zone in the preview iframe. It reuses the Media-page building blocks: an asset PICKER
// (the same native <select> over the asset list as the content editor's AssetRefField/VideoRefField)
// + an UPLOADER (the shared presign→PUT→confirm flow via uploadAsset()). When the user picks/uploads,
// it builds an AssetRef ({ assetId }) for images or a VideoRef ({ posterAssetId, mp4AssetId,
// webmAssetId? }) for video and hands it back via onApply — the controller does the GET-merge-PUT.

import { useMemo, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/admin/field";
import { uploadAsset, type UploadPhase } from "@/app/lib/upload-asset";

export interface AssetRow {
  id: string;
  kind: string; // IMAGE | VIDEO | SVG
  url: string;
  originalName: string;
}

/** AssetRef (image) or VideoRef (video) the drawer resolves and hands back. */
export type MediaRef =
  | { type: "image"; assetId: string }
  | { type: "video"; posterAssetId: string; mp4AssetId: string; webmAssetId?: string };

export interface EditTarget {
  field: string; // "<blockKey>.<path>", e.g. "hero.image" / "features.video.media"
  mediaKind: "image" | "video";
}

interface Props {
  open: boolean;
  target: EditTarget | null;
  assets: AssetRow[];
  saving: boolean;
  /** Re-fetch the asset list (after an upload adds a new one). */
  onAssetsRefresh: () => void;
  onApply: (ref: MediaRef) => void;
  onOpenChange: (open: boolean) => void;
}

const IMAGE_KINDS = new Set(["IMAGE", "SVG"]);

function phaseLabel(p: UploadPhase): string {
  return {
    hashing: "Computing checksum…",
    presigning: "Requesting upload URL…",
    uploading: "Uploading…",
    confirming: "Confirming…",
    done: "Uploaded.",
  }[p];
}

/** A reusable picker row: a native <select> over assets of the allowed kinds + an upload button. */
function AssetPicker({
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
  onChange: (assetId: string) => void;
  onUploaded: (asset: AssetRow) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options = useMemo(
    () => assets.filter((a) => (allowVideo ? a.kind === "VIDEO" : IMAGE_KINDS.has(a.kind))),
    [assets, allowVideo],
  );
  const accept = allowVideo
    ? "video/mp4,video/webm"
    : "image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml";
  const selected = options.find((a) => a.id === value);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const a = await uploadAsset(file, (p) => setStatus(phaseLabel(p)));
      onUploaded(a);
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
    <Field label={label} htmlFor={`pick-${label}`}>
      <div className="flex flex-col gap-2">
        {selected && !allowVideo && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary R2/MinIO origin; no loader
          <img
            src={selected.url}
            alt=""
            className="h-24 w-full rounded-md border border-border object-cover"
          />
        )}
        <select
          id={`pick-${label}`}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— none —</option>
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.originalName}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <input ref={inputRef} type="file" accept={accept} hidden onChange={onFile} disabled={busy} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
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

// Inner body — holds the per-field selection state. EditDrawer mounts it with key={target.field}
// so a NEW field gets a FRESH instance (selections reset) WITHOUT a setState-in-effect (which the
// React Compiler lint flags). Only rendered when there IS a target.
function DrawerBody({
  target,
  assets,
  saving,
  onAssetsRefresh,
  onApply,
  onCancel,
}: {
  target: EditTarget;
  assets: AssetRow[];
  saving: boolean;
  onAssetsRefresh: () => void;
  onApply: (ref: MediaRef) => void;
  onCancel: () => void;
}) {
  const [imageId, setImageId] = useState("");
  const [posterId, setPosterId] = useState("");
  const [mp4Id, setMp4Id] = useState("");
  const [webmId, setWebmId] = useState("");

  const isVideo = target.mediaKind === "video";
  const canApply = isVideo ? Boolean(posterId && mp4Id) : Boolean(imageId);

  function handleApply() {
    if (isVideo) {
      if (!posterId || !mp4Id) return;
      onApply({
        type: "video",
        posterAssetId: posterId,
        mp4AssetId: mp4Id,
        ...(webmId ? { webmAssetId: webmId } : {}),
      });
    } else {
      if (!imageId) return;
      onApply({ type: "image", assetId: imageId });
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Edit {target.mediaKind}</SheetTitle>
        <SheetDescription>
          Field:{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
            {target.field}
          </code>
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 p-4">
        {isVideo ? (
          <>
            <AssetPicker
              label="Poster image"
              allowVideo={false}
              assets={assets}
              value={posterId}
              onChange={setPosterId}
              onUploaded={onAssetsRefresh}
            />
            <AssetPicker
              label="MP4 video"
              allowVideo
              assets={assets}
              value={mp4Id}
              onChange={setMp4Id}
              onUploaded={onAssetsRefresh}
            />
            <AssetPicker
              label="WebM video (optional)"
              allowVideo
              assets={assets}
              value={webmId}
              onChange={setWebmId}
              onUploaded={onAssetsRefresh}
            />
            <p className="text-xs text-muted-foreground">
              A video needs at least a poster and an MP4. WebM is optional. Alt text and other
              video fields stay editable in the content editor.
            </p>
          </>
        ) : (
          <AssetPicker
            label="Image"
            allowVideo={false}
            assets={assets}
            value={imageId}
            onChange={setImageId}
            onUploaded={onAssetsRefresh}
          />
        )}
      </div>

      <SheetFooter className="flex-row justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={handleApply} disabled={!canApply || saving}>
          {saving ? "Saving…" : "Save & update preview"}
        </Button>
      </SheetFooter>
    </>
  );
}

export function EditDrawer({
  open,
  target,
  assets,
  saving,
  onAssetsRefresh,
  onApply,
  onOpenChange,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {target ? (
          // key forces a fresh DrawerBody (reset selections) when the edited field changes —
          // no setState-in-effect needed.
          <DrawerBody
            key={target.field}
            target={target}
            assets={assets}
            saving={saving}
            onAssetsRefresh={onAssetsRefresh}
            onApply={onApply}
            onCancel={() => onOpenChange(false)}
          />
        ) : (
          <SheetHeader>
            <SheetTitle>Edit media</SheetTitle>
            <SheetDescription>Pick an existing asset or upload a new one.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}
