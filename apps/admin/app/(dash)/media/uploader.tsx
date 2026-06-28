"use client";

import { useState, useRef, useCallback, lazy, Suspense } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionCard } from "@/components/admin/section-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadAsset, type UploadPhase } from "@/app/lib/upload-asset";

// CropView (+ react-easy-crop) is heavy and only needed when a raster image is chosen — lazy-load it.
const CropView = lazy(() =>
  import("@/app/(dash)/visual/crop-view").then((m) => ({ default: m.CropView })),
);

const ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
].join(",");

// Raster images we offer a crop step for. SVG (no raster crop) and GIF (would lose animation) and
// video upload straight through.
const CROPPABLE = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);

const PHASE_LABEL: Record<UploadPhase, string> = {
  hashing: "Computing checksum…",
  presigning: "Requesting upload URL…",
  uploading: "Uploading…",
  confirming: "Confirming…",
  done: "Done",
};

export function Uploader({ onUploaded }: { onUploaded?: () => void | Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  // Crop step (raster images only)
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  // Upload status (shared by the crop + direct paths)
  const [phase, setPhase] = useState<UploadPhase | null>(null);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const uploading = phase != null && phase !== "done";

  const clearCrop = useCallback(() => {
    setCropFile(null);
    setCropUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return null;
    });
  }, []);

  const doUpload = useCallback(
    async (data: File | Blob, name: string) => {
      setError(null);
      setDone(null);
      setPhase("hashing");
      setPct(0);
      try {
        const file =
          data instanceof File ? data : new File([data], name, { type: data.type });
        const asset = await uploadAsset(
          file,
          (p) => setPhase(p),
          (p) => setPct(p),
        );
        setPhase("done");
        setDone(`Uploaded "${asset.originalName}".`);
        clearCrop();
        await onUploaded?.(); // parent re-fetches the asset list (instant, no page refresh)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
        setPhase(null);
      }
    },
    [onUploaded, clearCrop],
  );

  const onPick = useCallback(
    (file: File) => {
      setError(null);
      setDone(null);
      if (inputRef.current) inputRef.current.value = "";
      if (CROPPABLE.has(file.type)) {
        const url = URL.createObjectURL(file);
        setCropFile(file);
        setCropUrl(url);
      } else {
        void doUpload(file, file.name); // svg / gif / video → straight to upload
      }
    },
    [doUpload],
  );

  return (
    <SectionCard title="Upload asset">
      {/* Drop zone / file picker */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !uploading) onPick(f);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
          uploading && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
          }}
        />
        <UploadCloud className="size-7 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium text-foreground">
          Drop a file here, or <span className="text-primary underline">browse</span>
        </span>
        <span className="text-xs text-muted-foreground">
          PNG · JPG · WebP · AVIF · SVG · GIF · MP4 · WebM — images can be cropped before upload
        </span>
      </label>

      {/* Direct-upload progress (the crop path shows its own bar inside the dialog) */}
      {uploading && !cropFile && (
        <div className="mt-3 flex flex-col gap-1.5">
          <p className="flex items-center justify-between text-sm text-primary">
            <span>{phase ? PHASE_LABEL[phase] : "Working…"}</span>
            {phase === "uploading" && (
              <span className="font-mono text-xs tabular-nums">{pct}%</span>
            )}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${phase === "uploading" ? pct : phase === "confirming" ? 100 : 8}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {done && !uploading && (
        <p
          role="status"
          className="mt-3 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {done}
        </p>
      )}

      {/* Crop dialog (raster images) — reuses the visual-editor crop step */}
      {cropFile && cropUrl && (
        <CropDialog
          file={cropFile}
          url={cropUrl}
          uploading={uploading}
          phaseLabel={phase ? PHASE_LABEL[phase] : null}
          pct={pct}
          error={error}
          onCancel={() => {
            if (!uploading) {
              clearCrop();
              setError(null);
            }
          }}
          onUseFull={() => void doUpload(cropFile, cropFile.name)}
          onCrop={(blob) => void doUpload(blob, cropFile.name)}
        />
      )}
    </SectionCard>
  );
}

// Thin wrapper: the crop step inside a modal. CropView itself is lazy + Suspense-bounded.
function CropDialog({
  file,
  url,
  uploading,
  phaseLabel,
  pct,
  error,
  onCancel,
  onUseFull,
  onCrop,
}: {
  file: File;
  url: string;
  uploading: boolean;
  phaseLabel: string | null;
  pct: number;
  error: string | null;
  onCancel: () => void;
  onUseFull: () => void;
  onCrop: (blob: Blob) => void;
}) {
  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop &amp; upload</DialogTitle>
          <DialogDescription>
            Adjust the crop, or keep the whole image — then upload it to the library.
          </DialogDescription>
        </DialogHeader>
        <Suspense
          fallback={
            <div className="grid h-64 place-items-center text-sm text-muted-foreground">
              Loading editor…
            </div>
          }
        >
          <CropView
            file={file}
            imageUrl={url}
            uploading={uploading}
            saving={false}
            uploadStatus={phaseLabel}
            uploadError={error}
            progressPct={pct}
            onCancel={onCancel}
            onUseFull={onUseFull}
            onCrop={onCrop}
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}
