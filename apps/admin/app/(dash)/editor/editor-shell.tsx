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
import { useRouter } from "next/navigation";
import type { BlockKey, ReleaseSnapshot } from "@signex/shared";

import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { PanelImperativeHandle } from "react-resizable-panels";
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

// Inline text edits arrive as a locale-agnostic path + a raw string for the CURRENT locale. The
// target leaf has one of three shapes, resolved from the existing value so the write lands correctly:
//   • plain locale-invariant string (e.g. timeline milestone `num`)      → write <path> as-is
//   • LocalizedText scalar  {en,vi}                                       → write <path>.<locale>
//   • item in a LocalizedTextArray {en:[],vi:[]} (path ends in an index)  → write <parent>.<locale>.<index>
// Without this, a plain-string leaf would be clobbered into {vi:"…"} (save 4xx) and a localized-array
// item would be written as a stray numeric key that the block schema strips (edit silently lost).
function resolveTextEditPath(
  blockData: Record<string, unknown>,
  rest: string[],
  locale: Locale,
): string {
  const pathNoLocale = rest.join(".");
  const leaf = getPath(blockData, pathNoLocale);
  if (typeof leaf === "string") return pathNoLocale; // plain locale-invariant string
  const last = rest[rest.length - 1];
  if (/^\d+$/.test(last)) {
    const parentPath = rest.slice(0, -1).join(".");
    const parent = parentPath ? getPath(blockData, parentPath) : blockData;
    if (
      parent &&
      typeof parent === "object" &&
      Array.isArray((parent as Record<string, unknown>).en) &&
      Array.isArray((parent as Record<string, unknown>).vi)
    ) {
      return `${parentPath}.${locale}.${last}`; // LocalizedTextArray item
    }
  }
  return `${pathNoLocale}.${locale}`; // LocalizedText scalar (default)
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

// A pending inline TEXT edit, mirrored to the overlay's applyEdits re-apply on `ready`. `field` is
// the locale-agnostic snapshot path (matches data-edit-field); `locale` says which locale's canvas
// it belongs to (the iframe is per-locale, so only the current locale's entries are re-posted).
interface TextPreview {
  field: string;
  value: string;
  locale: Locale;
}

// The union the overlay's applyEdits handler accepts (media live-swap + inline-text re-apply).
type ApplyEdit = MediaPreview | { field: string; kind: "text"; text: string };

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
  const router = useRouter();
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
  // Pending inline-text edits to re-apply to the canvas on `ready` (keyed by `${field}.${locale}` so
  // both locales of the same leaf survive independently). Cleared on Save / Discard like mediaPreview.
  const [textPreview, setTextPreview] = useState<Map<string, TextPreview>>(new Map());
  // Canvas→panel highlight: which panel field to flash (dotted path within the block) + a bumping
  // nonce so re-focusing the same canvas leaf re-triggers the flash.
  const [flashField, setFlashField] = useState<{ name: string; nonce: number } | null>(null);
  // Editor "take full page" toggle — overlays the dash sidebar/topbar (fixed inset-0).
  const [fullscreen, setFullscreen] = useState(false);
  // Bumped on every section select → ContextPanel scrolls to top + flashes (right-zone half of #2).
  const [panelFlash, setPanelFlash] = useState(0);
  // Collapse/expand the side panels (sections nav + context panel) to give the canvas more room.
  const leftPanelRef = useRef<PanelImperativeHandle>(null);
  const rightPanelRef = useRef<PanelImperativeHandle>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const toggleLeftPanel = useCallback(() => {
    const r = leftPanelRef.current;
    if (r) (r.isCollapsed() ? r.expand() : r.collapse());
  }, []);
  const toggleRightPanel = useCallback(() => {
    const r = rightPanelRef.current;
    if (r) (r.isCollapsed() ? r.expand() : r.collapse());
  }, []);

  // base snapshot is the last server-known draft; pending layers on top for the panel + dirty dots.
  const baseRef = useRef<ReleaseSnapshot>(structuredClone(initialSnapshot));
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const savingRef = useRef(false);
  const flashNonce = useRef(0);
  // Block to scroll-to in the canvas once the iframe (re)loads — set on select, re-sent on "ready"
  // so a select that ALSO changes the surface still scrolls after the new page has hydrated.
  const scrollOnReadyRef = useRef<BlockKey | null>(null);
  // Read fresh inside the (stably-subscribed) message listener without re-subscribing each render.
  const mediaPreviewRef = useRef(mediaPreview);
  mediaPreviewRef.current = mediaPreview;
  const textPreviewRef = useRef(textPreview);
  textPreviewRef.current = textPreview;
  // Read the live pending map inside the once-subscribed message listener (to shape-resolve inline
  // text edits against the working block data) without re-subscribing on every edit.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  // Live locale for the once-subscribed listener (inbound textEdit appends `.${langRef.current}`;
  // `ready` re-posts only this locale's pending text). Same pattern as mediaPreviewRef.
  const langRef = useRef(lang);
  langRef.current = lang;

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
    (edits: ApplyEdit[]) => {
      iframeRef.current?.contentWindow?.postMessage(
        { source: SOURCE, type: "applyEdits", edits },
        webOrigin,
      );
    },
    [webOrigin],
  );

  // Panel→canvas highlight: flash the canvas leaf matching a focused panel field's snapshot path.
  const postHighlight = useCallback(
    (field: string) => {
      iframeRef.current?.contentWindow?.postMessage(
        { source: SOURCE, type: "highlight", field },
        webOrigin,
      );
    },
    [webOrigin],
  );

  // Navigator→canvas: scroll the block's region into view + flash it (left-zone half of #2).
  const postScrollToBlock = useCallback(
    (blockKey: BlockKey) => {
      iframeRef.current?.contentWindow?.postMessage(
        { source: SOURCE, type: "scrollToBlock", blockKey },
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
      // Canvas: scroll+flash now (same surface), and again on the next "ready" (if the surface changed
      // the iframe is remounting, so the live scroll lands after the new page hydrates).
      scrollOnReadyRef.current = blockKey;
      postScrollToBlock(blockKey);
      // Right panel: scroll to top + flash.
      setPanelFlash((n) => n + 1);
    },
    [lang, previewPath, postScrollToBlock],
  );

  // Canvas→panel highlight (web→admin {type:"highlight"}): a canvas text-leaf was focused → select
  // its owning block (+ navigate the surface if needed — usually already current), then flash the
  // matching panel field. Stable (reads live locale via langRef + functional setState) so the
  // once-subscribed message listener can call it without re-subscribing.
  const onCanvasHighlight = useCallback((blockKey: BlockKey, fieldPath: string) => {
    setSelection({ blockKey, fieldPath, locale: langRef.current });
    const surface = SURFACE_PATH_BY_BLOCK[blockKey];
    if (surface !== null) setPreviewPath((p) => (p !== surface ? surface : p));
    flashNonce.current += 1;
    setFlashField({ name: fieldPath, nonce: flashNonce.current });
  }, []);

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
        setTextPreview(new Map());
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

  // beforeunload guard — only while there are unsaved edits. Covers full document unloads
  // (tab close / hard reload). Next App-Router client nav does NOT fire beforeunload, so the
  // capture-phase click guard below handles in-app <a>/<Link> navigation.
  useEffect(() => {
    if (pending.size === 0) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [pending.size]);

  // In-app SPA-nav guard — only while there are unsaved edits. Clicking a sidebar <Link>, the
  // Topbar, or the Toolbar's Back <a> would unmount EditorShell and silently drop the pending Map
  // (beforeunload never fires for App-Router client nav). We intercept the click in the CAPTURE
  // phase — before Next's <Link> handler runs — preventDefault the in-app navigation, and route it
  // through the existing discard AlertDialog; router.push(href) fires only on confirm (doDiscard).
  // The listener is attached ONLY when pending>0, so normal nav is never blocked.
  useEffect(() => {
    if (pending.size === 0) return;
    const onClick = (e: MouseEvent) => {
      // Let modified/middle clicks (new tab/window) and already-handled events through.
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const anchor = (e.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      const rawHref = anchor.getAttribute("href");
      if (
        !rawHref ||
        anchor.hasAttribute("download") ||
        (anchor.getAttribute("target") ?? "") === "_blank"
      )
        return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      // Only intercept same-origin in-app navigation that actually changes the page.
      if (url.origin !== window.location.origin) return;
      const dest = url.pathname + url.search + url.hash;
      if (dest === window.location.pathname + window.location.search + window.location.hash)
        return;
      e.preventDefault();
      setDiscardAsk({ kind: "leave", href: dest });
    };
    // Capture phase so we beat <Link>'s own bubble-phase click handler.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
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
      } else if (data.type === "textEdit" && typeof data.field === "string") {
        // A committed inline text edit. `field` is the snapshot path WITHOUT locale; append the live
        // locale so ONLY that leaf is written (the other locale stays untouched). Rides the SAME
        // pending Map + Save-draft batch + status pill as a panel edit — no separate persistence.
        const field = data.field as string;
        const value = String(data.value ?? "");
        const locale = langRef.current;
        const [blockKey, ...rest] = field.split(".") as [BlockKey, ...string[]];
        const blockData =
          pendingRef.current.get(blockKey) ??
          ((baseRef.current.blocks as unknown as Record<string, Record<string, unknown>>)[
            blockKey
          ] ??
            {});
        applyFieldEdit(blockKey, resolveTextEditPath(blockData, rest, locale), value);
        // Mirror it so `ready` can re-apply it to the canvas after a refresh / locale remount.
        setTextPreview((prev) => {
          const n = new Map(prev);
          n.set(`${field}.${locale}`, { field, value, locale });
          return n;
        });
      } else if (data.type === "highlight" && typeof data.field === "string") {
        // canvas→panel half of the two-way highlight: select + flash the matching panel field.
        const [blockKey, ...rest] = (data.field as string).split(".") as [BlockKey, ...string[]];
        onCanvasHighlight(blockKey, rest.join("."));
      } else if (data.type === "ready") {
        // Re-apply live media swaps AND this-locale pending inline TEXT after a (re)load / remount.
        const media = [...mediaPreviewRef.current.values()];
        const text: ApplyEdit[] = [...textPreviewRef.current.values()]
          .filter((t) => t.locale === langRef.current)
          .map((t) => ({ field: t.field, kind: "text" as const, text: t.value }));
        const all: ApplyEdit[] = [...media, ...text];
        if (all.length > 0) postApplyEdits(all);
        // A select that changed the surface remounted the iframe — scroll once it's ready.
        if (scrollOnReadyRef.current) {
          postScrollToBlock(scrollOnReadyRef.current);
          scrollOnReadyRef.current = null;
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [
    webOrigin,
    openMediaPicker,
    postApplyEdits,
    postScrollToBlock,
    applyFieldEdit,
    onCanvasHighlight,
  ]);

  // Esc exits full-page mode.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // ── Toolbar handlers ──────────────────────────────────────────────────────────
  const onSave = useCallback(() => {
    void saveDraft();
  }, [saveDraft]);

  const onDiscard = useCallback(() => {
    if (pending.size > 0) setDiscardAsk({ kind: "discard" });
  }, [pending.size]);

  const doDiscard = useCallback(() => {
    // A "leave" ask carries the intercepted in-app destination; navigate there on confirm.
    // A plain "discard" stays put and reverts the preview to the last saved draft.
    const leaveHref = discardAsk?.kind === "leave" ? discardAsk.href : undefined;
    setPending(new Map());
    setMediaPreview(new Map());
    setTextPreview(new Map());
    setDiscardAsk(null);
    if (leaveHref) router.push(leaveHref);
    else postRefresh();
  }, [discardAsk, router, postRefresh]);

  // Validity bubbles up from JSON field editors; the API's 422 is the authoritative gate, so we do
  // not block Save on it here. Kept as a stable no-op the panel can call.
  const onValidityChange = useCallback(() => {}, []);

  const deviceMax = DEVICE_MAX_WIDTH[device];

  return (
    <>
      <Toaster />

      {/* Discard / leave confirmation */}
      <AlertDialog open={discardAsk !== null} onOpenChange={(o) => !o && setDiscardAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {discardAsk?.kind === "leave" ? "Leave with unsaved changes?" : "Discard unsaved changes?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your {pending.size} unsaved edit{pending.size === 1 ? "" : "s"} will be lost
              {discardAsk?.kind === "leave"
                ? " if you leave the editor now."
                : " and the preview will revert to the last saved draft."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={doDiscard}>
              {discardAsk?.kind === "leave" ? "Leave" : "Discard"}
            </AlertDialogAction>
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

      {/* Editor column: toolbar on top, resizable 3-zone row below. Full-page mode overlays the
          dash sidebar/topbar (fixed inset-0) for maximum canvas. */}
      <div
        className={cn(
          "flex flex-col overflow-hidden border-0 bg-background",
          fullscreen
            ? "fixed inset-0 z-50 h-[100dvh]"
            : // Hard-cap to the viewport minus the dash topbar (h-14). The flex chain uses
              // min-h-svh (grows with content), so h-full wouldn't bound the editor and a tall
              // panel would stretch the whole page. A fixed height keeps each panel's ScrollArea
              // scrolling INTERNALLY — no full-page scroll.
              "h-[calc(100dvh-3.5rem)]",
        )}
      >
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
          fullscreen={fullscreen}
          onToggleFullscreen={() => setFullscreen((v) => !v)}
          leftCollapsed={leftCollapsed}
          rightCollapsed={rightCollapsed}
          onToggleLeft={toggleLeftPanel}
          onToggleRight={toggleRightPanel}
          onReload={postRefresh}
          onDiscard={onDiscard}
          onSave={onSave}
          onPublish={() => setPublishOpen(true)}
        />

        <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
          {/* Left — sections navigator. NOTE: react-resizable-panels v4 treats a bare-number
              size as PIXELS — sizes MUST be percentage strings or the panels collapse. */}
          <ResizablePanel
            panelRef={leftPanelRef}
            collapsible
            collapsedSize={0}
            defaultSize="11%"
            minSize="9%"
            maxSize="18%"
            onResize={(s) => setLeftCollapsed(s.asPercentage < 1)}
            className="bg-card"
          >
            <SectionsNav
              selectedBlockKey={selection?.blockKey ?? null}
              dirtyKeys={dirtyKeys}
              onSelect={onSelect}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Center — device-framed preview iframe */}
          <ResizablePanel defaultSize="71%" minSize="30%">
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
          <ResizablePanel
            panelRef={rightPanelRef}
            collapsible
            collapsedSize={0}
            defaultSize="18%"
            minSize="13%"
            maxSize="28%"
            onResize={(s) => setRightCollapsed(s.asPercentage < 1)}
            className="bg-card"
          >
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
              onFieldFocus={(name) => {
                if (selection) postHighlight(`${selection.blockKey}.${name}`);
              }}
              flashField={flashField}
              panelFlash={panelFlash}
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
