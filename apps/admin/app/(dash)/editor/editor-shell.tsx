"use client";

// app/(dash)/editor/editor-shell.tsx
// Unified Editor CONTROLLER (Plan 3 — Tasks 5 + the shell side of 7). Holds ALL client state and
// composes the three presentational zones (Toolbar / SectionsNav / ContextPanel) inside a resizable
// 3-zone layout around a cross-origin /preview iframe.
//
// State model:
//   • selection {blockKey,fieldPath,locale} — which section the panel edits.
//   • pending  Map<BlockKey, fullBlockData> — the client-held draft. Panel edits and media picks
//     merge into the in-memory block via setPath; the map IS the unsaved set (drives dirty dots +
//     the status pill). One Save-draft batches the whole map into ONE POST.
//   • baseRef — the last server-known draft snapshot; pending layers on top (workingBlockData).
//
// postMessage protocol (both directions { source: "signex-editor", ... }), origin-verified:
//   preview → admin:  { type: "edit", field, mediaKind }   → open the media picker
//                     { type: "ready" }                     → re-apply live media swaps after (re)load
//   admin   → preview: { type: "refresh" }                  → reload the iframe (after save / discard)
//                     { type: "applyEdits", edits:[…] }      → live DOM media swap (no reload)
//
// The NEW flow (vs the old /visual editor) records edits into `pending` and live-swaps the preview —
// it does NOT PUT per edit. Persistence happens once on Save draft (save-draft batch) / Publish.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BlockKey, ReleaseSnapshot } from "@signex/shared";

import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Toolbar } from "./toolbar";
import { SectionsNav } from "./sections-nav";
import { ContextPanel } from "./context-panel";
import {
  DEVICE_MAX_WIDTH,
  SURFACE_PATH_BY_BLOCK,
  type DeviceWidth,
  type Locale,
  type Selection,
  type ToolbarStatus,
} from "./_lib/blocks";
import type { FieldAssetRow } from "./_fields/field-editor";
import {
  MediaPickerDialog,
  type AssetRow,
  type EditTarget,
  type MediaRef,
} from "@/app/(dash)/visual/media-picker-dialog";

const SOURCE = "signex-editor";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface EditorShellProps {
  webOrigin: string;
  previewSecret: string;
  themeId: string;
  themeName: string;
  initialSnapshot: ReleaseSnapshot;
  initialDraftRevision: number;
  initialPublishedRevision: number;
  canPublish: boolean;
  assets: FieldAssetRow[];
}

// ─── setPath / getPath (copied verbatim from visual/visual-editor.tsx) ────────

// Set a nested path (dot-separated) on a deep-cloned object, returning the new object.
// Intermediate objects are created if missing. Used to merge a field/media value into block data.
function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
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

// Live-swap descriptor mirrored to the preview overlay (keyed by full "blockKey.path" field).
interface MediaPreview {
  field: string;
  kind: "image" | "video";
  url?: string;
  posterUrl?: string;
  mp4Url?: string;
  webmUrl?: string;
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function EditorShell(props: EditorShellProps) {
  const {
    webOrigin,
    previewSecret,
    themeId,
    themeName,
    initialSnapshot,
    initialDraftRevision,
    initialPublishedRevision,
    canPublish,
    assets: initialAssets,
  } = props;

  // ── Step 1: state + primitives ──────────────────────────────────────────────
  const [lang, setLang] = useState<Locale>("vi");
  const [device, setDevice] = useState<DeviceWidth>("desktop");
  const [previewPath, setPreviewPath] = useState<string>(""); // "" | "/about" | "/contact"
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pending, setPending] = useState<Map<BlockKey, Record<string, unknown>>>(new Map());
  const [draftRevision, setDraftRevision] = useState(initialDraftRevision);
  const [publishedRevision, setPublishedRevision] = useState(initialPublishedRevision);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [discardAsk, setDiscardAsk] = useState<null | { kind: "discard" | "leave"; href?: string }>(
    null,
  );
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishNote, setPublishNote] = useState("");

  // Media picker (full AssetRow list with URLs is loaded lazily; props.assets is the lean panel list).
  const [pickerAssets, setPickerAssets] = useState<AssetRow[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<EditTarget | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<Map<string, MediaPreview>>(new Map());

  // base snapshot is the last server-known draft; pending layers on top for the panel + dirty dots.
  const baseRef = useRef<ReleaseSnapshot>(structuredClone(initialSnapshot));
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const savingRef = useRef(false);
  // Read fresh inside the (stably-subscribed) message listener without re-subscribing each render.
  const mediaPreviewRef = useRef(mediaPreview);
  mediaPreviewRef.current = mediaPreview;

  const workingBlockData = useCallback(
    (key: BlockKey): Record<string, unknown> => {
      const fromPending = pending.get(key);
      if (fromPending) return fromPending;
      const blocks = baseRef.current.blocks as unknown as Record<string, Record<string, unknown>>;
      return blocks[key] ?? {};
    },
    [pending],
  );

  // ── Step 2: applyFieldEdit (panel) + iframe URL ──────────────────────────────

  // fieldName is a path WITHIN the block (e.g. "titleTop" or "featured.image").
  const applyFieldEdit = useCallback((blockKey: BlockKey, fieldName: string, value: unknown) => {
    setPending((prev) => {
      const next = new Map(prev);
      const base =
        next.get(blockKey) ??
        structuredClone(
          (baseRef.current.blocks as unknown as Record<string, Record<string, unknown>>)[blockKey] ??
            {},
        );
      next.set(blockKey, setPath(base, fieldName, value));
      return next;
    });
  }, []);

  const previewUrl = useMemo(
    () =>
      `${webOrigin}/preview/${lang}${previewPath}?secret=${encodeURIComponent(
        previewSecret,
      )}&editable=1&theme=${encodeURIComponent(themeId)}`,
    [webOrigin, lang, previewPath, previewSecret, themeId],
  );

  // ── Media picker assets ───────────────────────────────────────────────────────
  const loadAssets = useCallback(async (): Promise<AssetRow[]> => {
    setPickerLoading(true);
    try {
      const res = await fetch("/admin-api/assets", { cache: "no-store" });
      if (!res.ok) return pickerAssets;
      const data = (await res.json()) as AssetRow[];
      if (Array.isArray(data)) {
        setPickerAssets(data);
        return data;
      }
      return pickerAssets;
    } catch {
      return pickerAssets;
    } finally {
      setPickerLoading(false);
    }
  }, [pickerAssets]);

  // ── postMessage helpers ───────────────────────────────────────────────────────
  const postRefresh = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ source: SOURCE, type: "refresh" }, webOrigin);
  }, [webOrigin]);

  const postApplyEdits = useCallback(
    (edits: MediaPreview[]) => {
      iframeRef.current?.contentWindow?.postMessage(
        { source: SOURCE, type: "applyEdits", edits },
        webOrigin,
      );
    },
    [webOrigin],
  );

  // ── Media picker open / apply ─────────────────────────────────────────────────
  const openMediaPicker = useCallback(
    (field: string, kind: "image" | "video") => {
      setMediaTarget({ field, mediaKind: kind });
      setPickerOpen(true);
      void loadAssets();
    },
    [loadAssets],
  );

  const applyMediaRef = useCallback(
    async (ref: MediaRef) => {
      if (!mediaTarget) return;
      const [blockKey, ...rest] = mediaTarget.field.split(".") as [BlockKey, ...string[]];
      const path = rest.join(".");

      // Ensure a just-uploaded asset is resolvable to a URL for the live swap.
      let list = pickerAssets;
      const need = ref.type === "image" ? ref.assetId : ref.posterAssetId;
      if (!list.find((a) => a.id === need)) list = await loadAssets();
      const find = (id: string | undefined) =>
        id ? list.find((a) => a.id === id)?.url : undefined;

      const base =
        pending.get(blockKey) ??
        structuredClone(
          (baseRef.current.blocks as unknown as Record<string, Record<string, unknown>>)[blockKey] ??
            {},
        );
      const existing = (getPath(base, path) as Record<string, unknown> | undefined) ?? {};

      let nextValue: Record<string, unknown>;
      let preview: Omit<MediaPreview, "field">;
      if (ref.type === "image") {
        nextValue = { ...existing, assetId: ref.assetId };
        preview = { kind: "image", url: find(ref.assetId) };
      } else {
        nextValue = { ...existing, posterAssetId: ref.posterAssetId, mp4AssetId: ref.mp4AssetId };
        if (ref.webmAssetId) nextValue.webmAssetId = ref.webmAssetId;
        else delete nextValue.webmAssetId;
        preview = {
          kind: "video",
          posterUrl: find(ref.posterAssetId),
          mp4Url: find(ref.mp4AssetId),
          webmUrl: find(ref.webmAssetId),
        };
      }

      setPending((prev) => {
        const n = new Map(prev);
        n.set(blockKey, setPath(base, path, nextValue));
        return n;
      });
      const entry: MediaPreview = { field: mediaTarget.field, ...preview };
      setMediaPreview((prev) => {
        const n = new Map(prev);
        n.set(mediaTarget.field, entry);
        return n;
      });
      postApplyEdits([entry]);
      setPickerOpen(false);
      setMediaTarget(null);
    },
    [mediaTarget, pickerAssets, pending, loadAssets, postApplyEdits],
  );

  // ── Step 3: selection → panel + (page-backed) iframe navigation ──────────────
  const onSelect = useCallback(
    (blockKey: BlockKey) => {
      setSelection({ blockKey, fieldPath: null, locale: lang });
      const surface = SURFACE_PATH_BY_BLOCK[blockKey];
      if (surface !== null && surface !== previewPath) setPreviewPath(surface);
    },
    [lang, previewPath],
  );

  // ── Step 4: Save draft ───────────────────────────────────────────────────────
  const dirtyKeys = useMemo(() => new Set(pending.keys()), [pending]);

  // Returns the new draftRevision on success, or null on failure / conflict.
  const saveDraft = useCallback(async (): Promise<number | null> => {
    if (savingRef.current) return null;
    if (pending.size === 0) return draftRevision;
    savingRef.current = true;
    setSaving(true);
    const edits = [...pending.entries()].map(([key, data]) => ({ key, data }));
    try {
      const res = await fetch(`/admin-api/themes/${themeId}/save-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits, expectedDraftRevision: draftRevision }),
      });
      if (res.ok) {
        const body = (await res.json()) as { draftRevision: number };
        // Adopt the persisted edits into the base snapshot, then clear pending + live swaps.
        const blocks = baseRef.current.blocks as unknown as Record<
          string,
          Record<string, unknown>
        >;
        for (const [k, d] of pending) blocks[k] = d;
        setDraftRevision(body.draftRevision);
        setPending(new Map());
        setMediaPreview(new Map());
        toast.success("Saved to draft.");
        postRefresh();
        return body.draftRevision;
      }
      if (res.status === 409) {
        // STALE_DRAFT: refetch the theme, adopt the latest revision + base, KEEP pending (it stays
        // layered on the new base via workingBlockData). The editor re-saves on the next click.
        const fresh = await fetch(`/admin-api/themes/${themeId}`, { cache: "no-store" });
        if (fresh.ok) {
          const t = (await fresh.json()) as {
            draftSnapshot: ReleaseSnapshot;
            draftRevision: number;
          };
          baseRef.current = t.draftSnapshot;
          setDraftRevision(t.draftRevision);
          toast.message(
            "Draft changed elsewhere — re-applying your edits on the latest. Save again to retry.",
          );
        } else {
          toast.error("Draft conflict (409). Reload the editor.");
        }
        return null;
      }
      if (res.status === 422) {
        const b = (await res.json().catch(() => null)) as {
          code?: string;
          key?: string;
          detail?: string;
        } | null;
        toast.error(
          `Validation failed${b?.key ? ` on ${b.key}` : ""}${b?.detail ? ` — ${b.detail}` : ""}.`,
        );
        return null;
      }
      toast.error(`Save failed (${res.status}).`);
      return null;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
      return null;
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }, [pending, themeId, draftRevision, postRefresh]);

  // ── Step 5: Publish (save pending first) ──────────────────────────────────────
  const publish = useCallback(
    async (note?: string) => {
      if (publishing) return;
      setPublishing(true);
      try {
        let expected = draftRevision;
        if (pending.size > 0) {
          const rev = await saveDraft();
          if (rev == null) return; // save failed / conflicted — abort publish
          expected = rev;
        }
        const res = await fetch("/admin-api/releases/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            themeId,
            expectedDraftRevision: expected,
            note: note || "Unified editor",
          }),
        });
        if (res.ok) {
          setPublishedRevision(expected);
          toast.success("Published.");
        } else if (res.status === 409) {
          toast.error("Publish conflict (409) — draft changed. Save again, then publish.");
        } else {
          const b = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(b?.error ?? `Publish failed (${res.status}).`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Publish failed.");
      } finally {
        setPublishing(false);
      }
    },
    [publishing, pending, saveDraft, themeId, draftRevision],
  );

  // ── Step 6: status, guards, postMessage bridge ────────────────────────────────
  const status: ToolbarStatus = saving
    ? { kind: "saving" }
    : pending.size > 0
      ? { kind: "unsaved", count: pending.size }
      : { kind: "saved", revision: draftRevision };
  const draftAhead =
    draftRevision !== publishedRevision ? { draftRevision, publishedRevision } : null;
  const publishEnabled = pending.size > 0 || draftRevision !== publishedRevision;
  const saveEnabled = pending.size > 0;
  const busy = saving || publishing;

  // beforeunload guard — only while there are unsaved edits. A plain <a> Back (the Toolbar renders
  // one) is a full navigation, so this also covers leaving the editor with pending edits.
  useEffect(() => {
    if (pending.size === 0) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [pending.size]);

  // Inbound bridge: preview overlay → admin. Subscribed once; reads live media via a ref.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== webOrigin) return;
      const data = e.data;
      if (!data || typeof data !== "object" || data.source !== SOURCE) return;
      if (data.type === "edit" && typeof data.field === "string") {
        const kind = data.mediaKind === "video" ? "video" : "image";
        openMediaPicker(data.field, kind);
      } else if (data.type === "ready") {
        // Re-apply all live media swaps after a (re)load / locale-surface remount.
        const all = [...mediaPreviewRef.current.values()];
        if (all.length > 0) postApplyEdits(all);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [webOrigin, openMediaPicker, postApplyEdits]);

  // ── Toolbar handlers ──────────────────────────────────────────────────────────
  const onSave = useCallback(() => {
    void saveDraft();
  }, [saveDraft]);

  const onDiscard = useCallback(() => {
    if (pending.size > 0) setDiscardAsk({ kind: "discard" });
  }, [pending.size]);

  const doDiscard = useCallback(() => {
    setPending(new Map());
    setMediaPreview(new Map());
    setDiscardAsk(null);
    postRefresh();
  }, [postRefresh]);

  // Validity bubbles up from JSON field editors; the API's 422 is the authoritative gate, so we do
  // not block Save on it here. Kept as a stable no-op the panel can call.
  const onValidityChange = useCallback(() => {}, []);

  const deviceMax = DEVICE_MAX_WIDTH[device];

  return (
    <>
      <Toaster />

      {/* Discard confirmation */}
      <AlertDialog open={discardAsk !== null} onOpenChange={(o) => !o && setDiscardAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your {pending.size} unsaved edit{pending.size === 1 ? "" : "s"} will be lost and the
              preview will revert to the last saved draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={doDiscard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Publish confirmation (PUBLISHER only — the toolbar hides the trigger otherwise) */}
      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending.size > 0 ? "Save & publish" : "Publish"}</AlertDialogTitle>
            <AlertDialogDescription>
              Visitors will see this theme; the current live theme is kept as a draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1">
            <Input
              value={publishNote}
              onChange={(e) => setPublishNote(e.target.value)}
              placeholder="Release note (optional)"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const note = publishNote.trim();
                setPublishOpen(false);
                setPublishNote("");
                void publish(note || undefined);
              }}
            >
              {pending.size > 0 ? "Save & publish" : "Publish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Editor column: toolbar on top, resizable 3-zone row below. */}
      <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col overflow-hidden rounded-lg border border-border bg-background">
        <Toolbar
          themeName={themeName}
          backHref="/themes"
          lang={lang}
          onLangChange={setLang}
          device={device}
          onDeviceChange={setDevice}
          status={status}
          draftAheadOf={draftAhead}
          canPublish={canPublish}
          publishEnabled={publishEnabled}
          saveEnabled={saveEnabled}
          busy={busy}
          onReload={postRefresh}
          onDiscard={onDiscard}
          onSave={onSave}
          onPublish={() => setPublishOpen(true)}
        />

        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          {/* Left — sections navigator */}
          <ResizablePanel defaultSize={18} minSize={12} maxSize={28} className="bg-card">
            <SectionsNav
              selectedBlockKey={selection?.blockKey ?? null}
              dirtyKeys={dirtyKeys}
              onSelect={onSelect}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Center — device-framed preview iframe */}
          <ResizablePanel defaultSize={56} minSize={30}>
            <div className="flex h-full justify-center overflow-auto bg-muted/30 p-2">
              <div
                className="h-full w-full transition-[max-width] duration-200"
                style={deviceMax ? { maxWidth: `${deviceMax}px` } : undefined}
              >
                <iframe
                  ref={iframeRef}
                  // key forces a fresh load on locale/surface change (clean overlay re-attach).
                  key={`${lang}${previewPath}`}
                  src={previewUrl}
                  title="Theme preview"
                  className="h-full w-full rounded-md border border-border bg-background"
                />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right — context panel */}
          <ResizablePanel defaultSize={26} minSize={18} maxSize={40} className="bg-card">
            <ContextPanel
              blockKey={selection?.blockKey ?? null}
              blockData={selection ? workingBlockData(selection.blockKey) : {}}
              assets={initialAssets}
              onFieldChange={(name, v) => {
                if (selection) applyFieldEdit(selection.blockKey, name, v);
              }}
              onPickMedia={(name, kind) => {
                if (selection) openMediaPicker(`${selection.blockKey}.${name}`, kind);
              }}
              onValidityChange={onValidityChange}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <MediaPickerDialog
        open={pickerOpen}
        target={mediaTarget}
        assets={pickerAssets}
        assetsLoading={pickerLoading}
        saving={false}
        onAssetsRefresh={() => void loadAssets()}
        onApply={applyMediaRef}
        onOpenChange={(o) => {
          setPickerOpen(o);
          if (!o) setMediaTarget(null);
        }}
      />
    </>
  );
}
