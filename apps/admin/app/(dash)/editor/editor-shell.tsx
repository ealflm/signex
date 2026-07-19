"use client";

// app/(dash)/editor/editor-shell.tsx
// Unified Editor CONTROLLER (Plan 3 — Tasks 5 + the shell side of 7). Holds ALL client state and
// composes the three presentational zones (Toolbar / SectionsNav / ContextPanel) inside a resizable
// 3-zone layout around a cross-origin /preview iframe.
//
// The right zone is MODE-dynamic: ContextPanel (the section form) in every mode but colour, and
// ColorPanel in colour mode, driven by what the preview resolved from the click.
//
// State model:
//   • selection {blockKey,fieldPath,locale} — which section the panel edits.
//   • pending  Map<BlockKey, fullBlockData> — the client-held draft. Panel edits and media picks
//     merge into the in-memory block via setPath; the map IS the unsaved set (drives dirty dots +
//     the status pill). One Save-draft batches the whole map into ONE POST.
//   • baseRef — the last server-known draft snapshot; pending layers on top (workingBlockData).
//
// The preview is spoken to over the postMessage bridge in _lib/preview-bridge.ts — that file owns
// the protocol, the origin checks and the listener; the shell owns what to say and when. Inbound
// messages arrive at handleBridgeMessage below, already gated on origin + source.
//
// The NEW flow (vs the old /visual editor) records edits into `pending` and live-swaps the preview —
// it does NOT PUT per edit. Persistence happens once on Save draft (save-draft batch) / Publish.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  paletteStyle,
  isVideoRef,
  type BlockKey,
  type MediaRef as SharedMediaRef,
  type ReleaseSnapshot,
} from "@signex/shared";

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
import { ColorPanel } from "./_panels/color-panel";
import { readColorTarget, type ColorTarget } from "./_lib/color-target";
import {
  DEVICE_MAX_WIDTH,
  SURFACE_PATH_BY_BLOCK,
  isBlockKey,
  parseCanvasField,
  type DeviceWidth,
  type Locale,
  type Selection,
  type ToolbarStatus,
} from "./_lib/blocks";
import { DEFAULT_MODE, MODE_LENS, type EditMode } from "./_lib/modes";
import {
  usePreviewBridge,
  type ApplyEdit,
  type BridgeMessage,
  type MediaPreview,
} from "./_lib/preview-bridge";
import type { FieldAssetRow } from "./_fields/field-editor";
import {
  MediaPickerDialog,
  type AssetRow,
  type EditTarget,
  type MediaRef,
} from "@/app/(dash)/visual/media-picker-dialog";
import { pickerDefaultKind } from "@/app/(dash)/visual/picker-default-kind";
import { adminApi, stripBasePath } from "@/app/lib/base-path";
import { rebasePalette, type PaletteWorkingSet } from "./_lib/palette-working-set";
import { createPaletteAuditor } from "./_lib/palette-audit";
import { buildMediaValue } from "./media-apply";

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
//   • plain locale-invariant string (e.g. timeline milestone `num`)      → write the string at <path>
//   • item in a LocalizedTextArray {en:[],vi:[]} (path ends in an index)  → write the string at <parent>.<locale>.<index>
//   • LocalizedText scalar  {en,vi}                                       → write the WHOLE {en,vi} at <path>
// The scalar case writes the merged object (not just <path>.<locale>) so an absent/partial OPTIONAL
// leaf — present in the published schema but not yet in this draft — stays schema-valid (LocalizedText
// requires BOTH locales). The other locale is preserved from the existing value, or seeded with the new
// text when missing. Without this, a plain-string leaf would be clobbered into {vi:"…"} (save 4xx) and a
// localized-array item would be written as a stray numeric key the block schema strips (edit lost).
function resolveTextEdit(
  blockData: Record<string, unknown>,
  rest: string[],
  locale: Locale,
  value: string,
): { path: string; value: unknown } {
  const pathNoLocale = rest.join(".");
  const leaf = getPath(blockData, pathNoLocale);
  if (typeof leaf === "string") return { path: pathNoLocale, value }; // plain locale-invariant string
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
      return { path: `${parentPath}.${locale}.${last}`, value }; // LocalizedTextArray item
    }
  }
  // LocalizedText scalar: write the whole {en,vi}, preserving the other locale (or seeding it).
  const cur = leaf && typeof leaf === "object" ? (leaf as Record<string, unknown>) : {};
  const merged: Record<string, string> = {
    en: typeof cur.en === "string" ? cur.en : value,
    vi: typeof cur.vi === "string" ? cur.vi : value,
    [locale]: value,
  };
  return { path: pathNoLocale, value: merged };
}

// A pending inline TEXT edit, mirrored to the overlay's applyEdits re-apply on `ready`. `field` is
// the locale-agnostic snapshot path (matches data-edit-field); `locale` says which locale's canvas
// it belongs to (the iframe is per-locale, so only the current locale's entries are re-posted).
interface TextPreview {
  field: string;
  value: string;
  locale: Locale;
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
  const router = useRouter();
  const [lang, setLang] = useState<Locale>("vi");
  const [device, setDevice] = useState<DeviceWidth>("desktop");
  const [previewPath, setPreviewPath] = useState<string>(""); // "" | "/about" | "/contact"
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pending, setPending] = useState<Map<BlockKey, Record<string, unknown>>>(new Map());
  // ── The palette working set ──────────────────────────────────────────────────
  // Unlike `pending` (a PATCH layered on baseRef per block), the palette is held as TWO values that
  // compose into ONE the panel and the preview both read: `savedPalette` (what the server has) and
  // `pendingPalette` (the COMPLETE palette the user is working on, once they've touched it).
  // Hence `PaletteWorkingSet`, not a patch type — see _lib/palette-working-set.ts.
  //
  // Why complete rather than a patch: a patch cannot express a DELETION (both merges — here and in
  // theme.service.ts — are additive-only), and it cannot be shown. The old palette rail panel bound
  // straight to the patch and so, the moment a save cleared it, displayed the TEMPLATE defaults
  // (#2ec4b6) while the preview correctly rendered the saved #ff0000 — the panel disagreeing with
  // the canvas about what colour the site is. Same defect, one layer down, is why `applyPalette`
  // must post the COMPLETE css: it REPLACES #signex-palette wholesale, so posting a patch after a
  // save would blank every colour the patch didn't mention.
  const [savedPalette, setSavedPalette] = useState<PaletteWorkingSet>(initialSnapshot.palette ?? {});
  const [pendingPalette, setPendingPalette] = useState<PaletteWorkingSet>({});
  // Has the user touched the palette this session? An empty `pendingPalette` is ambiguous on its own
  // — it is both "nothing changed" and "reset everything" — so the flag is what distinguishes them,
  // and what makes a reset-only change dirty, saveable, and re-postable. It also says pendingPalette
  // is COMPLETE, which is exactly the condition under which `replacePalette: true` is correct.
  const [paletteTouched, setPaletteTouched] = useState(false);
  // The last colour-mode click, as resolved by the preview's color-engine (inbound `colorTarget`).
  // Cleared on every `ready`: a (re)loaded document makes the previous resolution stale.
  const [colorTarget, setColorTarget] = useState<ColorTarget | null>(null);
  // Stored override selectors the preview reports as matching 0 or >1 elements (inbound
  // `selectorAudit`). Reported, never auto-removed — the user decides.
  const [broken, setBroken] = useState<string[]>([]);
  // Which capability a canvas click invokes. Admin-side UI state, never persisted; the preview only
  // learns it from the `setMode` messages posted below (onModeChange + the `ready` handshake).
  const [mode, setMode] = useState<EditMode>(DEFAULT_MODE);
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
  // Read the live palette working set inside the once-subscribed message listener (re-post + audit
  // on `ready`) without re-subscribing on every palette change. Same pattern as pendingRef.
  const pendingPaletteRef = useRef(pendingPalette);
  pendingPaletteRef.current = pendingPalette;
  // A staged reset is an unsaved change whose palette is EMPTY, so the `ready` handler can't infer
  // it from pendingPalette alone (same reason saveDraft/unsavedCount check it separately).
  const paletteTouchedRef = useRef(paletteTouched);
  paletteTouchedRef.current = paletteTouched;
  // Live locale for the once-subscribed listener (inbound textEdit appends `.${langRef.current}`;
  // `ready` re-posts only this locale's pending text). Same pattern as mediaPreviewRef.
  const langRef = useRef(lang);
  langRef.current = lang;
  // Live mode for the once-subscribed listener, so `ready` re-posts the mode the toolbar shows RIGHT
  // NOW — not the one captured when the listener subscribed. Same pattern as langRef.
  const modeRef = useRef(mode);
  modeRef.current = mode;

  /**
   * The palette AS IT IS RIGHT NOW: the user's complete working set once they've touched it, else
   * whatever the server last saved. This single value is what the panel displays, what the preview
   * is re-themed with, and what every panel edit is computed FROM — which is what keeps
   * `pendingPalette` complete (each edit is `f(effectivePalette)`) and what keeps the panel showing
   * the site's real colours across a save boundary.
   */
  const effectivePalette = useMemo(
    () => (paletteTouched ? pendingPalette : savedPalette),
    [paletteTouched, pendingPalette, savedPalette],
  );

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
      const res = await fetch(adminApi("/admin-api/assets"), { cache: "no-store" });
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

  // ── Preview bridge ────────────────────────────────────────────────────────────
  // Posters out + the (origin-verified) inbound listener live in _lib/preview-bridge.ts; the shell
  // keeps only the decisions about what to say and when.
  //
  // `handleBridgeMessage` is declared BELOW, as a hoisted function: it posts back through this very
  // bridge, so the two reference each other. That cycle is declaration-order only — the bridge's own
  // listener is what invokes the handler, and by then `bridge` is initialised. usePreviewBridge holds
  // it as an effect event, so re-creating it each render neither re-subscribes the listener nor
  // leaves the handler reading a stale render's values.
  const bridge = usePreviewBridge({ iframeRef, webOrigin, onMessage: handleBridgeMessage });

  // Mode lives here but is ENFORCED in the iframe, so every mode change has to be posted. This is
  // best-effort by nature: a preview that is still loading (or reloading) has no listener yet and
  // drops the message. The `ready` handler below is what makes that safe — it re-posts modeRef on
  // every (re)load, so the last mode the toolbar shows always wins. Both halves are needed: `ready`
  // alone would ignore mode changes made while the preview sits loaded, and this alone would lose
  // any change racing a reload.
  const onModeChange = useCallback(
    (m: EditMode) => {
      setMode(m);
      bridge.postMode(m);
    },
    [bridge],
  );

  // Asks the preview which stored override selectors are dead. Stable (the bridge is), and it owns
  // the "don't re-ask an unchanged question" rule itself — see palette-audit.ts for WHEN and why.
  const auditPalette = useMemo(() => createPaletteAuditor(bridge.postAuditSelectors), [bridge]);

  // Adopts a new complete palette AND live-applies it to the preview (same bridge idiom as
  // postApplyEdits — the overlay listens for both). Called on every colour panel change.
  //
  // `next` is always the WHOLE palette, because the panel computes it from `effectivePalette` (see
  // there). That is what lets the css posted here be complete — applyPalette REPLACES the
  // #signex-palette node, so anything missing from `next` would vanish from the canvas — and what
  // lets the save be a `replacePalette`, which is the only way a removal can ever reach the server.
  const applyPalette = useCallback(
    (next: PaletteWorkingSet) => {
      setPendingPalette(next);
      setPaletteTouched(true);
      bridge.postApplyPalette(paletteStyle(next) ?? "");
      // Re-audit here, not only on `ready`: whether a stored selector still matches is a property of
      // the WORKING SET, not of the document. Auditing only on load left a cleared override's row on
      // screen until the next reload, and its "Xoá" live to re-dirty the palette on every click.
      auditPalette(next);
    },
    [bridge, auditPalette],
  );

  // "Đặt lại toàn bộ màu" — the empty palette is a real, complete working set, not "no change":
  // `paletteTouched` is what tells Save to send it as a replace, so previously-saved keys are
  // actually removed rather than merged over with nothing (which the additive merge treats as a no-op).
  const onResetPalette = useCallback(() => applyPalette({}), [applyPalette]);

  // ── Media picker open / apply ─────────────────────────────────────────────────
  const openMediaPicker = useCallback(
    (field: string, kind: "image" | "video", flexible?: boolean) => {
      setMediaTarget({ field, mediaKind: kind, flexible });
      setPickerOpen(true);
      void loadAssets();
    },
    [loadAssets],
  );

  // The open target field's CURRENT kind, read straight from the working block data — not from
  // mediaTarget.mediaKind, which the overlay hard-codes to "image" for every flexible slot (its
  // hasCap check tries "image" first) and so cannot tell an empty/new slot from one already holding
  // a video. null only for a slot with no value yet, in which case the picker's toggle (Task 9)
  // falls back to the posted mediaKind via pickerDefaultKind.
  const storedMediaKind = useMemo<"image" | "video" | null>(() => {
    if (!mediaTarget) return null;
    const [blockKey, ...rest] = mediaTarget.field.split(".") as [BlockKey, ...string[]];
    const value = getPath(workingBlockData(blockKey), rest.join("."));
    return value == null ? null : isVideoRef(value as SharedMediaRef) ? "video" : "image";
  }, [mediaTarget, workingBlockData]);

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

      // Clean-replace, never merge: buildMediaValue returns EXACTLY the target-kind shape, so an
      // image↔video switch can never leave a hybrid (stray assetId on a video, stray poster/mp4 on
      // an image) for MediaRef to silently misread on the next load (see media-apply.ts).
      const nextValue = buildMediaValue(ref, existing);
      let preview: Omit<MediaPreview, "field">;
      if (ref.type === "image") {
        preview = { kind: "image", url: find(ref.assetId) };
      } else {
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
      bridge.postApplyEdits([entry]);
      setPickerOpen(false);
      setMediaTarget(null);
    },
    [mediaTarget, pickerAssets, pending, loadAssets, bridge],
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
      bridge.postScrollToBlock(blockKey);
      // Right panel: scroll to top + flash.
      setPanelFlash((n) => n + 1);
    },
    [lang, previewPath, bridge],
  );

  // Selection follows the click (spec §1): a canvas click selects the block it landed in, whatever
  // the mode, so the panel is always describing the thing you just clicked. Without it a Media click
  // opens the picker and a Colour click fills the colour panel while the rail — and the section form
  // behind it — keep pointing at an unrelated section. The Text path gets this from `highlight`,
  // which carries a field; the other two have only a blockKey, which is why their messages have one.
  //
  // Guarded on change, by the updater's own bail-out: re-selecting the block already open returns
  // `cur` unchanged, React skips the re-render, and the panel's flash effect (keyed on blockKey)
  // never re-fires — so clicking around inside the section you are already editing does not strobe
  // the panel on every click. No panelFlash bump for the same reason it isn't needed: a canvas click
  // can only ever select a DIFFERENT block here, and that alone re-runs the effect. (The rail's
  // onSelect bumps it because re-picking the current section there must still flash.)
  //
  // No surface navigation here, unlike onSelect: the click came FROM the document the preview is
  // showing, so its surface IS the current one by construction — setting previewPath could only ever
  // remount the iframe and throw away the click that asked for it. Stable (live locale read through
  // langRef) so the once-subscribed message listener can call it.
  const selectFromCanvas = useCallback((blockKey: unknown) => {
    if (!isBlockKey(blockKey)) return; // an unknown key would crash deriveFields — see isBlockKey
    const locale = langRef.current;
    setSelection((cur) =>
      cur?.blockKey === blockKey ? cur : { blockKey, fieldPath: null, locale },
    );
  }, []);

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
    // A reset-only change (pendingPalette back to {}) must still be saveable — an empty palette
    // can't distinguish "nothing changed" from "user reset everything", so `paletteTouched` is
    // what says a change happened.
    if (pending.size === 0 && !paletteTouched) return draftRevision;
    savingRef.current = true;
    setSaving(true);
    const edits = [...pending.entries()].map(([key, data]) => ({ key, data }));
    try {
      const res = await fetch(adminApi(`/admin-api/themes/${themeId}/save-draft`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edits,
          expectedDraftRevision: draftRevision,
          // Only speak about the palette when the user touched it — and when they did, say the
          // whole thing. `pendingPalette` is the COMPLETE working set (every panel edit is computed
          // from `effectivePalette`), so `replacePalette` is not the special "reset" signal it was:
          // it is simply the truthful verb for a complete value, and the only one under which a
          // removed seed/token/override can actually reach the server.
          //
          // Replace is only HONEST while the working set was derived from what the server actually
          // holds — otherwise it silently overwrites whoever wrote in between. `expectedDraftRevision`
          // is what makes that true: the server 409s instead of accepting a stale replace, and the
          // 409 branch below rebases the working set onto theirs before the retry.
          palette: paletteTouched ? pendingPalette : undefined,
          replacePalette: paletteTouched,
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as { draftRevision: number };
        // Adopt the persisted edits + palette into the base snapshot, then clear pending + live swaps.
        const blocks = baseRef.current.blocks as unknown as Record<
          string,
          Record<string, unknown>
        >;
        for (const [k, d] of pending) blocks[k] = d;
        if (paletteTouched) {
          // Mirrors what the server just did with `replacePalette` — adopt the working set VERBATIM.
          // `savedPalette` is the state the panel reads once `pendingPalette` is cleared below, so
          // these two must be set together or the panel snaps back to the template defaults while
          // the canvas keeps rendering the colours that were saved.
          baseRef.current.palette = pendingPalette;
          setSavedPalette(pendingPalette);
        }
        setDraftRevision(body.draftRevision);
        setPending(new Map());
        setPendingPalette({});
        setPaletteTouched(false);
        setMediaPreview(new Map());
        setTextPreview(new Map());
        toast.success("Saved to draft.");
        bridge.postRefresh();
        return body.draftRevision;
      }
      if (res.status === 409) {
        // STALE_DRAFT: refetch the theme, adopt the latest revision + base, KEEP pending (it stays
        // layered on the new base via workingBlockData). The editor re-saves on the next click.
        const fresh = await fetch(adminApi(`/admin-api/themes/${themeId}`), { cache: "no-store" });
        if (fresh.ok) {
          const t = (await fresh.json()) as {
            draftSnapshot: ReleaseSnapshot;
            draftRevision: number;
          };
          // The base `pendingPalette` was derived from — read BEFORE baseRef is overwritten with
          // theirs. It is `savedPalette` seen from here (saveDraft writes the two together), and it
          // is what makes `ours vs base` mean this session's edits rather than its whole palette.
          const oldBase = baseRef.current.palette ?? {};
          const theirs = t.draftSnapshot.palette ?? {};
          baseRef.current = t.draftSnapshot;
          // Adopt the other session's palette as the new base. An UNTOUCHED palette therefore shows
          // and renders theirs, and there is nothing to rebase.
          setSavedPalette(theirs);
          // A TOUCHED one is re-derived onto theirs — the palette half of what this branch already
          // does for block edits, which stay layered on the new base via workingBlockData. Without
          // it the retry's `replacePalette: true` would hand the server a working set built on a
          // base that no longer exists and wipe every colour the other session saved, including the
          // ones this session never looked at — which is not the "re-applying your edits on the
          // latest" the toast below promises. applyPalette (not a bare setState) because the canvas
          // must re-theme to what the panel now shows, and the rebase can change the override set.
          if (paletteTouched) applyPalette(rebasePalette(pendingPalette, oldBase, theirs));
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
  }, [pending, pendingPalette, paletteTouched, themeId, draftRevision, bridge, applyPalette]);

  // ── Step 5: Publish (save pending first) ──────────────────────────────────────
  const publish = useCallback(
    async (note?: string) => {
      if (publishing) return;
      setPublishing(true);
      try {
        let expected = draftRevision;
        if (pending.size > 0 || paletteTouched) {
          const rev = await saveDraft();
          if (rev == null) return; // save failed / conflicted — abort publish
          expected = rev;
        }
        const res = await fetch(adminApi("/admin-api/releases/publish"), {
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
    [publishing, pending, paletteTouched, saveDraft, themeId, draftRevision],
  );

  // ── Step 6: status and guards (the bridge itself now lives in _lib/preview-bridge) ──
  // A palette-only change (no block edits) counts as unsaved too — it drives the same dirty
  // indicator, save/publish enablement, and navigation guards as a block edit. A reset counts too,
  // even though it leaves the palette EMPTY — otherwise a reset-only change looks "clean" and Save
  // never fires the request that clears the saved palette. `paletteTouched` is exactly that fact.
  const unsavedCount = pending.size + (paletteTouched ? 1 : 0);
  const status: ToolbarStatus = saving
    ? { kind: "saving" }
    : unsavedCount > 0
      ? { kind: "unsaved", count: unsavedCount }
      : { kind: "saved", revision: draftRevision };
  const draftAhead =
    draftRevision !== publishedRevision ? { draftRevision, publishedRevision } : null;
  const publishEnabled = unsavedCount > 0 || draftRevision !== publishedRevision;
  const saveEnabled = unsavedCount > 0;
  const busy = saving || publishing;

  // beforeunload guard — only while there are unsaved edits. Covers full document unloads
  // (tab close / hard reload). Next App-Router client nav does NOT fire beforeunload, so the
  // capture-phase click guard below handles in-app <a>/<Link> navigation.
  useEffect(() => {
    if (unsavedCount === 0) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [unsavedCount]);

  // In-app SPA-nav guard — only while there are unsaved edits. Clicking a sidebar <Link>, the
  // Topbar, or the Toolbar's Back <a> would unmount EditorShell and silently drop the pending Map
  // (beforeunload never fires for App-Router client nav). We intercept the click in the CAPTURE
  // phase — before Next's <Link> handler runs — preventDefault the in-app navigation, and route it
  // through the existing discard AlertDialog; router.push(href) fires only on confirm (doDiscard).
  // The listener is attached ONLY when there's something unsaved, so normal nav is never blocked.
  useEffect(() => {
    if (unsavedCount === 0) return;
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
  }, [unsavedCount]);

  // Inbound bridge: preview overlay → admin. `data` has passed the bridge's origin + source gate and
  // nothing else, so every branch narrows its own fields. The bridge subscribes its listener ONCE, so
  // live values are read through refs here rather than captured.
  function handleBridgeMessage(data: BridgeMessage) {
    if (data.type === "edit" && typeof data.field === "string") {
      const target = parseCanvasField(data.field);
      if (!target) return; // unknown block — nothing downstream has a schema for it
      const kind = data.mediaKind === "video" ? "video" : "image";
      // Both caps on the clicked element (Tasks 4–6's four flexible slots) → the picker offers the
      // Ảnh/Video toggle (Task 9); a single-kind slot (e.g. a logo) never sets this.
      const flexible = data.flexible === true;
      // Selection follows the click: `field` is "<blockKey>.<path>", so the media hotspot names its
      // own block. Do this BEFORE opening the picker, so closing it leaves the Media form showing
      // the section you clicked rather than whatever was selected beforehand.
      selectFromCanvas(target.blockKey);
      // …and the OTHER half of what the Media panel owes a click (spec §Media: "every media in the
      // selected section; click scrolls + highlights one"). Selection alone only gets the right
      // section on screen — it says nothing about WHICH of that section's media you just clicked,
      // and `features`/`aboutPage` list several. `path` is the within-block dotted name, which is
      // exactly the identity FieldEditor matches flashField against (see onCanvasHighlight, which
      // computes it the same way for the text path).
      //
      // The scroll is the durable half: the picker opens over this, so the 900ms ring is spent
      // behind a modal, but the row is scrolled into view and is still there when the picker closes.
      flashNonce.current += 1;
      setFlashField({ name: target.path.join("."), nonce: flashNonce.current });
      openMediaPicker(data.field, kind, flexible);
    } else if (data.type === "colorTarget") {
      // A colour-mode click. The preview has already done the only part that needs a DOM: it
      // resolved which element PAINTS each colour role, what that role renders as, which seed/token
      // drives it, and a provably-unique selector for it. The panel offers exactly that; the admin
      // adds nothing of its own except the parse (readColorTarget — every field is untrusted, and
      // each one ends up in a persisted palette).
      const target = readColorTarget(data);
      if (target) {
        setColorTarget(target);
        // Selection follows the click. A colour click can land on an element with no
        // data-edit-field, so the highlight path cannot carry it — `blockKey` is exactly why the
        // message has that field. "" (an element outside any block) fails isBlockKey and is a no-op.
        selectFromCanvas(target.blockKey);
      }
    } else if (data.type === "selectorAudit" && Array.isArray(data.broken)) {
      // The overlay's answer to postAuditSelectors: stored override selectors that no longer match
      // exactly one element on this page. Shown, never auto-removed (see the panel).
      setBroken((data.broken as unknown[]).filter((s): s is string => typeof s === "string"));
    } else if (data.type === "textEdit" && typeof data.field === "string") {
      // A committed inline text edit. `field` is the snapshot path WITHOUT locale; append the live
      // locale so ONLY that leaf is written (the other locale stays untouched). Rides the SAME
      // pending Map + Save-draft batch + status pill as a panel edit — no separate persistence.
      const field = data.field;
      const target = parseCanvasField(field);
      // An unknown block cannot be written: applyFieldEdit would seed `pending` with a key the
      // schema has no entry for, which the save-draft validation then rejects — poisoning EVERY
      // later save with an edit the user cannot see or remove. Dropping it is the lesser evil.
      if (!target) return;
      const { blockKey, path: rest } = target;
      const value = String(data.value ?? "");
      const locale = langRef.current;
      const blockData =
        pendingRef.current.get(blockKey) ??
        ((baseRef.current.blocks as unknown as Record<string, Record<string, unknown>>)[blockKey] ??
          {});
      const edit = resolveTextEdit(blockData, rest, locale, value);
      applyFieldEdit(blockKey, edit.path, edit.value);
      // Mirror it so `ready` can re-apply it to the canvas after a refresh / locale remount.
      setTextPreview((prev) => {
        const n = new Map(prev);
        n.set(`${field}.${locale}`, { field, value, locale });
        return n;
      });
    } else if (data.type === "highlight" && typeof data.field === "string") {
      // canvas→panel half of the two-way highlight: select + flash the matching panel field.
      // Guarded like every other inbound block key: onCanvasHighlight setSelection's the key
      // unconditionally, and ContextPanel then does deriveFields(BLOCK_REGISTRY[k]) — the shortest
      // path to the exact crash isBlockKey exists to stop.
      const target = parseCanvasField(data.field);
      if (!target) return;
      onCanvasHighlight(target.blockKey, target.path.join("."));
    } else if (data.type === "ready") {
      // Push the live mode into the fresh overlay. This is the ONLY way a (re)loaded preview
      // learns the mode: it boots in "content" and postMode's earlier posts died with the
      // previous document. Read modeRef, not `mode` — a mode changed WHILE the iframe was
      // reloading was dropped on the floor, and this re-post is what recovers it.
      // Deliberately unguarded, unlike the palette below: mode is pure UI state that the preview
      // has no other source for, so re-asserting it can only ever restore agreement. (The palette
      // is the opposite — the preview server-renders its own, so speaking unprompted DESTROYS it.)
      bridge.postMode(modeRef.current);
      // Re-apply live media swaps AND this-locale pending inline TEXT after a (re)load / remount.
      const media = [...mediaPreviewRef.current.values()];
      const text: ApplyEdit[] = [...textPreviewRef.current.values()]
        .filter((t) => t.locale === langRef.current)
        .map((t) => ({ field: t.field, kind: "text" as const, text: t.value }));
      const all: ApplyEdit[] = [...media, ...text];
      if (all.length > 0) bridge.postApplyEdits(all);
      // Re-apply the unsaved palette after a (re)load / remount, same as media/text above — and
      // note the `all.length > 0` guard those get. The palette needs the same guard: the preview
      // SERVER-RENDERS the saved palette into #signex-palette, and posting unconditionally sent
      // `css: ""` on every clean load (the working set is empty whenever there's nothing unsaved —
      // including right after a save), which blanked that node and showed the site WITHOUT its own
      // saved colours. Only speak when we have something to say — and a staged reset is the one
      // empty palette that IS something to say: it must post "" so the cleared preview survives.
      if (paletteTouchedRef.current) {
        bridge.postApplyPalette(paletteStyle(pendingPaletteRef.current) ?? "");
      }
      // Re-audit the working set's override selectors against the fresh DOM. Unconditional, unlike
      // the palette: the audit is a QUESTION, not an assertion, so asking it costs the preview
      // nothing and never overwrites anything. This is no longer the ONLY asker (applyPalette asks
      // whenever the set of targets changes) — it is the asker for the case a changed set cannot
      // see: a DIFFERENT DOM, which is a new answer to the same question. Hence `force`, and hence
      // still asking on every load: a save refreshes the iframe, and the page a selector must match
      // changes with the surface and the locale too, not only with the palette.
      // A fresh document also invalidates the last click's resolution (its hexes were measured in
      // the previous one), so the panel goes back to asking for a click rather than quoting a
      // measurement that no longer holds.
      setColorTarget(null);
      // The LIVE working set's selectors, not the unsaved ones: auditing pendingPalette alone would
      // report nothing after a save (it is empty by then) and silently retire the feature — a SAVED
      // override whose selector drifted is the whole case worth surfacing. `baseRef.current.palette`
      // is `savedPalette` seen from here: two views of one fact that saveDraft writes together, and
      // the snapshot is the one this once-subscribed listener can read without a mirror ref.
      const saved = baseRef.current.palette ?? {};
      const working = paletteTouchedRef.current ? pendingPaletteRef.current : saved;
      auditPalette(working, { force: true });
      // A select that changed the surface remounted the iframe — scroll once it's ready.
      if (scrollOnReadyRef.current) {
        bridge.postScrollToBlock(scrollOnReadyRef.current);
        scrollOnReadyRef.current = null;
      }
    }
  }

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
    if (unsavedCount > 0) setDiscardAsk({ kind: "discard" });
  }, [unsavedCount]);

  const doDiscard = useCallback(() => {
    // A "leave" ask carries the intercepted in-app destination; navigate there on confirm.
    // A plain "discard" stays put and reverts the preview to the last saved draft.
    const leaveHref = discardAsk?.kind === "leave" ? discardAsk.href : undefined;
    setPending(new Map());
    setPendingPalette({});
    setPaletteTouched(false);
    setMediaPreview(new Map());
    setTextPreview(new Map());
    setDiscardAsk(null);
    if (leaveHref) router.push(stripBasePath(leaveHref));
    else bridge.postRefresh();
  }, [discardAsk, router, bridge]);

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
              Your {unsavedCount} unsaved edit{unsavedCount === 1 ? "" : "s"} will be lost
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
            <AlertDialogTitle>{unsavedCount > 0 ? "Save & publish" : "Publish"}</AlertDialogTitle>
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
              {unsavedCount > 0 ? "Save & publish" : "Publish"}
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
          backHref={adminApi("/themes")}
          lang={lang}
          onLangChange={setLang}
          device={device}
          onDeviceChange={setDevice}
          mode={mode}
          onModeChange={onModeChange}
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
          onReload={bridge.postRefresh}
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
            {/* The panel is MODE-dynamic: colour mode owns this zone, every other mode leaves the
                section form in it — under that mode's LENS (MODE_LENS: Media lists the section's
                media, Text its strings, Content everything, as before modes existed). The lens
                recurses, so media/text nested inside an array or object is listed too — which for
                sections like `features` is the ONLY route to it, the canvas not offering one. One
                ContextPanel with a lens, not one copy per mode: the header, the ScrollArea, the
                FieldEditor loop and the flash wiring are identical in all three, and three copies of
                them would be three places to fix the next flash bug.
                Not a third, independent selection — that was the old "Bảng màu"
                rail item, and having two routes to the same colours meant the rail and the toolbar
                could each claim to be showing you the editor. */}
            {mode === "color" ? (
              <ColorPanel
                target={colorTarget}
                // The EFFECTIVE palette, never the unsaved patch alone: after a save the patch is
                // empty, and a panel bound to it would show the TEMPLATE defaults while the preview
                // rendered the saved colours.
                palette={effectivePalette}
                broken={broken}
                onChange={applyPalette}
                onReset={onResetPalette}
              />
            ) : (
              <ContextPanel
                {...(MODE_LENS[mode] ?? {})}
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
                  if (selection) bridge.postHighlight(`${selection.blockKey}.${name}`);
                }}
                flashField={flashField}
                panelFlash={panelFlash}
              />
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <MediaPickerDialog
        open={pickerOpen}
        target={mediaTarget}
        assets={pickerAssets}
        assetsLoading={pickerLoading}
        saving={false}
        flexible={mediaTarget?.flexible ?? false}
        defaultKind={pickerDefaultKind(storedMediaKind, mediaTarget?.mediaKind ?? "image")}
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
