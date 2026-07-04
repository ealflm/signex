"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AssetRow } from "./types";
import { adminApi } from "@/app/lib/base-path";

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface Usage {
  working: { id: string; field: string }[];
  releases: { releaseId: string }[];
}

interface AssetDialogProps {
  asset: AssetRow;
  canDelete: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void | Promise<void>;
}

export function AssetDialog({ asset, canDelete, open, onOpenChange, onChanged }: AssetDialogProps) {
  // Initialized from props; the dialog is keyed by asset id (it remounts per asset) so these stay fresh.
  const [altEn, setAltEn] = useState(asset.altDefault?.en ?? "");
  const [altVi, setAltVi] = useState(asset.altDefault?.vi ?? "");
  const [savingAlt, setSavingAlt] = useState(false);
  const [altMsg, setAltMsg] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Look up where the asset is used (gates Delete; the API blocks deleting an in-use asset).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch(adminApi(`/admin-api/assets/usage?assetId=${encodeURIComponent(asset.id)}`), { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Usage>) : null))
      .then((d) => {
        if (alive) setUsage(d ?? { working: [], releases: [] });
      })
      .catch(() => {
        if (alive) setUsage({ working: [], releases: [] });
      });
    return () => {
      alive = false;
    };
  }, [open, asset.id]);

  const inUse = usage ? usage.working.length + usage.releases.length : null;
  const usageLoading = usage === null;

  function copy(text: string, key: string) {
    void navigator.clipboard?.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
  }

  async function saveAlt() {
    setSavingAlt(true);
    setAltMsg(null);
    try {
      const res = await fetch(adminApi(`/admin-api/assets/${asset.id}/alt`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alt: { en: altEn, vi: altVi } }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setAltMsg("Saved.");
      await onChanged?.();
    } catch (e) {
      setAltMsg(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSavingAlt(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    setDelErr(null);
    try {
      const res = await fetch(adminApi(`/admin-api/assets/${asset.id}`), { method: "DELETE" });
      if (!res.ok) {
        throw new Error(
          res.status === 409
            ? "Asset is in use — remove it from all themes first."
            : `Delete failed (${res.status}).`,
        );
      }
      setConfirmDel(false);
      onOpenChange(false);
      await onChanged?.();
    } catch (e) {
      setDelErr(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-4xl">
          {/* Header — filename + a quick-facts line */}
          <DialogHeader className="space-y-1.5 border-b border-border px-6 py-4 pr-12 text-left">
            <DialogTitle className="truncate text-base">{asset.originalName}</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <Badge variant="secondary" className="font-mono font-medium">
                  {asset.kind}
                </Badge>
                {asset.width != null && asset.height != null && (
                  <span className="font-mono tabular-nums">
                    {asset.width}×{asset.height}
                  </span>
                )}
                <span aria-hidden>·</span>
                <span className="font-mono tabular-nums">{humanBytes(asset.bytes)}</span>
              </div>
            </DialogDescription>
          </DialogHeader>

          {/* Body: the asset (hero, on a checkerboard) | info rail */}
          <div className="grid max-h-[min(85vh,640px)] sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {/* Preview */}
            <div className="sx-checker grid min-h-[240px] place-items-center overflow-hidden border-b border-border p-4 sm:min-h-0 sm:border-b-0 sm:border-r">
              {asset.kind === "VIDEO" ? (
                <video
                  src={asset.url}
                  controls
                  playsInline
                  className="max-h-full max-w-full rounded object-contain shadow-elevated"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- external R2/MinIO host
                <img
                  src={asset.url}
                  alt={asset.altDefault?.en ?? asset.originalName}
                  className="max-h-full max-w-full rounded object-contain shadow-elevated"
                />
              )}
            </div>

            {/* Info rail */}
            <div className="flex min-w-0 flex-col gap-4 overflow-y-auto p-6">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {asset.width != null && asset.height != null && (
                  <>
                    <dt className="text-muted-foreground">Dimensions</dt>
                    <dd className="font-mono tabular-nums">
                      {asset.width}×{asset.height}
                    </dd>
                  </>
                )}
                {asset.duration != null && (
                  <>
                    <dt className="text-muted-foreground">Duration</dt>
                    <dd className="font-mono tabular-nums">{Math.round(asset.duration)}s</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Size</dt>
                <dd className="font-mono tabular-nums">{humanBytes(asset.bytes)}</dd>
                <dt className="text-muted-foreground">Type</dt>
                <dd className="truncate font-mono text-xs">{asset.mime}</dd>
                <dt className="text-muted-foreground">Used in</dt>
                <dd>
                  {usageLoading ? (
                    <span className="text-muted-foreground">…</span>
                  ) : (
                    `${inUse} place${inUse === 1 ? "" : "s"}`
                  )}
                </dd>
              </dl>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => copy(asset.url, "url")}>
                  <Copy className="size-3.5" />
                  {copied === "url" ? "Copied" : "Copy URL"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => copy(asset.id, "id")}>
                  <Copy className="size-3.5" />
                  {copied === "id" ? "Copied" : "Copy ID"}
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={asset.url} target="_blank" rel="noopener noreferrer">
                    Open
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </div>

              {/* Alt text */}
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium text-foreground">Alt text</p>
                  <p className="text-xs text-muted-foreground">
                    Describes the image for screen readers and search engines.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="alt-en" className="text-xs text-muted-foreground">
                    English
                  </Label>
                  <Input
                    id="alt-en"
                    value={altEn}
                    onChange={(e) => setAltEn(e.target.value)}
                    placeholder="Describe the image…"
                  />
                  <Label htmlFor="alt-vi" className="text-xs text-muted-foreground">
                    Tiếng Việt
                  </Label>
                  <Input
                    id="alt-vi"
                    value={altVi}
                    onChange={(e) => setAltVi(e.target.value)}
                    placeholder="Mô tả ảnh…"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button type="button" size="sm" onClick={saveAlt} disabled={savingAlt}>
                    {savingAlt ? "Saving…" : "Save alt text"}
                  </Button>
                  {altMsg && (
                    <span
                      className={cn(
                        "text-xs",
                        altMsg === "Saved." ? "text-success" : "text-destructive",
                      )}
                    >
                      {altMsg}
                    </span>
                  )}
                </div>
              </div>

              {/* Delete — pinned to the bottom of the rail */}
              {canDelete && (
                <div className="mt-auto flex flex-col gap-1 border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-fit text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={usageLoading || (inUse ?? 0) > 0}
                    onClick={() => setConfirmDel(true)}
                  >
                    <Trash2 className="size-4" />
                    Delete asset
                  </Button>
                  {inUse != null && inUse > 0 && (
                    <p className="text-xs text-muted-foreground">
                      In use in {inUse} place{inUse === 1 ? "" : "s"} — remove it there before
                      deleting.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={confirmDel} onOpenChange={(o) => !deleting && setConfirmDel(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{asset.originalName}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the asset from the library. It can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {delErr && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {delErr}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={deleting} onClick={doDelete}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
