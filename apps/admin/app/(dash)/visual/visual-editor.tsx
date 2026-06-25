"use client";

// app/(dash)/visual/visual-editor.tsx
// Visual editor CONTROLLER (Phase 1 — media). Renders the toolbar + the live-preview iframe, listens
// for the preview overlay's postMessages, opens the edit drawer, and performs the save (GET block →
// merge the AssetRef/VideoRef into the nested field → PUT with the working revision) and the publish.
//
// postMessage protocol (both directions { source: "signex-editor", ... }):
//   preview → admin:  { type: "edit", field, mediaKind }      (we VERIFY event.origin === webOrigin)
//   admin   → preview: { type: "refresh" }                    (after a save → iframe reloads)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { BLOCK_KIND_BY_KEY, type BlockKey } from "@signex/shared";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { EditDrawer, type AssetRow, type EditTarget, type MediaRef } from "./edit-drawer";

const SOURCE = "signex-editor";
const LOCALES = ["vi", "en"] as const;
type Locale = (typeof LOCALES)[number];

interface DiffStatus {
  dirty: boolean;
  revision: number;
  lastPublishedRevision: number;
}

interface Props {
  webOrigin: string; // browser-reachable web origin, e.g. http://localhost:3062
  previewSecret: string; // gates the /preview route (internal-tool URL token; see page.tsx)
  initialRevision: number;
  initialDirty: boolean;
}

// Set a nested path (dot-separated) on a deep-cloned object, returning the new object.
// Intermediate objects are created if missing. Used to merge an AssetRef/VideoRef into block data.
function setPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const clone = structuredClone(obj ?? {});
  const parts = path.split(".");
  let cur: Record<string, unknown> = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return clone;
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}

export function VisualEditor({ webOrigin, previewSecret, initialRevision, initialDirty }: Props) {
  const [lang, setLang] = useState<Locale>("vi");
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [target, setTarget] = useState<EditTarget | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(initialDirty);
  const revisionRef = useRef(initialRevision);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const previewUrl = useMemo(
    () => `${webOrigin}/preview/${lang}?secret=${encodeURIComponent(previewSecret)}&editable=1`,
    [webOrigin, lang, previewSecret],
  );
  const publicUrl = `${webOrigin}/${lang}`;

  const loadAssets = useCallback(async () => {
    try {
      const res = await fetch("/admin-api/assets", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as AssetRow[];
      if (Array.isArray(data)) setAssets(data);
    } catch {
      /* non-fatal — pickers just show no existing options */
    }
  }, []);

  const refreshDiff = useCallback(async () => {
    try {
      const res = await fetch("/admin-api/releases/diff", { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as DiffStatus;
      revisionRef.current = d.revision;
      setDirty(d.dirty);
    } catch {
      /* keep last-known revision */
    }
  }, []);

  // Tell the iframe to reload so it renders the just-saved working state.
  const refreshPreview = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ source: SOURCE, type: "refresh" }, webOrigin);
  }, [webOrigin]);

  // ---- inbound: preview overlay → admin "edit" → open the drawer -------------------------------
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Verify the message really came from our web preview origin.
      if (e.origin !== webOrigin) return;
      const data = e.data;
      if (!data || typeof data !== "object" || data.source !== SOURCE) return;
      if (data.type === "edit" && typeof data.field === "string") {
        const mediaKind = data.mediaKind === "video" ? "video" : "image";
        setTarget({ field: data.field, mediaKind });
        setDrawerOpen(true);
        void loadAssets();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [webOrigin, loadAssets]);

  // ---- save: GET block → merge ref into nested field → PUT --------------------------------------
  async function applyRef(ref: MediaRef) {
    if (!target) return;
    setSaving(true);
    try {
      const [blockKey, ...rest] = target.field.split(".");
      const path = rest.join(".");
      const kind = BLOCK_KIND_BY_KEY[blockKey as BlockKey];
      if (!kind) {
        toast.error(`Unknown block "${blockKey}"`);
        return;
      }

      // 1) Current block data.
      const getRes = await fetch(`/admin-api/content/blocks/${kind}/${blockKey}`, { cache: "no-store" });
      if (!getRes.ok) {
        toast.error(`Could not load block "${blockKey}" (${getRes.status}).`);
        return;
      }
      const raw = (await getRes.json()) as unknown;
      const current = raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};

      // 2) Build the new field value, preserving sibling keys (e.g. AssetRef.alt).
      const existing = (getPath(current, path) as Record<string, unknown> | undefined) ?? {};
      let nextValue: Record<string, unknown>;
      if (ref.type === "image") {
        nextValue = { ...existing, assetId: ref.assetId };
      } else {
        // VideoRef is all-or-nothing: set poster+mp4, set webm only if provided (else drop a stale one).
        nextValue = { ...existing, posterAssetId: ref.posterAssetId, mp4AssetId: ref.mp4AssetId };
        if (ref.webmAssetId) nextValue.webmAssetId = ref.webmAssetId;
        else delete nextValue.webmAssetId;
      }
      const nextData = setPath(current, path, nextValue);

      // 3) Fresh optimistic-lock revision, then PUT.
      await refreshDiff();
      const putRes = await fetch(`/admin-api/content/blocks/${kind}/${blockKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: nextData, expectedRevision: revisionRef.current }),
      });

      if (putRes.ok) {
        const body = (await putRes.json().catch(() => null)) as { revision?: number } | null;
        if (body && typeof body.revision === "number") revisionRef.current = body.revision;
        setDirty(true);
        toast.success("Saved to working state.");
        setDrawerOpen(false);
        setTarget(null);
        refreshPreview();
      } else if (putRes.status === 409) {
        toast.error("Conflict (409) — the working state changed. Reopen and try again.");
        await refreshDiff();
      } else if (putRes.status === 422) {
        const b = (await putRes.json().catch(() => null)) as { error?: string } | null;
        toast.error(`Validation failed (422)${b?.error ? ` — ${b.error}` : ""}.`);
      } else {
        const b = (await putRes.json().catch(() => null)) as { error?: string } | null;
        toast.error(b?.error ?? `Save failed (${putRes.status}).`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  // ---- publish: POST /admin-api/releases/publish ------------------------------------------------
  async function publish() {
    setPublishing(true);
    try {
      await refreshDiff();
      const res = await fetch("/admin-api/releases/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Visual editor", expectedRevision: revisionRef.current }),
      });
      if (res.ok) {
        toast.success("Published.");
        await refreshDiff();
        refreshPreview();
      } else if (res.status === 409) {
        toast.error("Publish conflict (409) — working state changed since load. Try again.");
        await refreshDiff();
      } else {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(b?.error ?? `Publish failed (${res.status}).`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <Toaster />
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Locale</span>
          <div className="flex overflow-hidden rounded-md border border-border">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={[
                  "px-3 py-1.5 text-sm font-medium uppercase transition-colors",
                  l === lang
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-muted-foreground hover:text-foreground",
                ].join(" ")}
                aria-pressed={l === lang}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {dirty && (
            <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
              Unpublished changes
            </span>
          )}
          <Button type="button" variant="outline" size="sm" onClick={refreshPreview}>
            <RefreshCw className="size-4" />
            Reload preview
          </Button>
          <Button asChild type="button" variant="ghost" size="sm">
            <a href={publicUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              Open public site
            </a>
          </Button>
          <Button type="button" size="sm" onClick={publish} disabled={publishing || !dirty}>
            {publishing ? "Publishing…" : "Publish"}
          </Button>
        </div>
      </div>

      {/* Live preview iframe */}
      <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
        <iframe
          ref={iframeRef}
          // key forces a fresh load on locale switch (and a clean re-attach of the overlay).
          key={previewUrl}
          src={previewUrl}
          title="Live preview"
          className="h-[78vh] w-full border-0 bg-background"
        />
      </div>

      <EditDrawer
        open={drawerOpen}
        target={target}
        assets={assets}
        saving={saving}
        onAssetsRefresh={loadAssets}
        onApply={applyRef}
        onOpenChange={(o) => {
          setDrawerOpen(o);
          if (!o) setTarget(null);
        }}
      />
    </>
  );
}
