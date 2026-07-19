"use client";

// app/(dash)/editor/_lib/preview-bridge.ts
// The ADMIN half of the editor's postMessage bridge to the cross-origin /preview iframe. The other
// half is apps/web's app/components/editor/edit-overlay.tsx; between them they are the whole
// protocol, and neither app's typechecker can see the other, so the two files are held together by
// their comments and by the shapes asserted in preview-bridge.test.ts.
//
// Lifted out of editor-shell.tsx, which owned this inline alongside the palette, the mode, the
// selection and the panel. The shell now CONSUMES a bridge rather than being one: it keeps every
// decision about what to say and when, and this file keeps only the speaking.
//
//   admin → preview:  { type: "setMode", mode }        which capability a canvas click invokes
//                     { type: "refresh" }              reload the iframe (after save / discard)
//                     { type: "highlight", field }     flash a canvas leaf (panel→canvas)
//                     { type: "scrollToBlock", blockKey }  scroll+flash a block (navigator→canvas)
//                     { type: "applyEdits", edits }    live DOM swap of media / pending inline text
//                     { type: "applyPalette", css }    live re-theme of #signex-palette
//                     { type: "auditSelectors", selectors }  ask which stored override selectors are dead
//   preview → admin:  handed to `onMessage` verbatim — see the shell's branches.
//
// ORIGIN. Every outbound post is addressed to `webOrigin` (never "*"), and every inbound message is
// checked against it. Both directions, both checks, deliberately: the overlay checks neither by
// documented design (see its SECURITY note), so the admin side is the only side that does.

import { useEffect, useEffectEvent, useMemo, type RefObject } from "react";
import type { EditMode } from "@signex/shared";

/** The stamp both halves put on every message, and require on every message they honour. */
export const SOURCE = "signex-editor";

/** Live-swap descriptor mirrored to the preview overlay (keyed by full "blockKey.path" field). */
export interface MediaPreview {
  field: string;
  kind: "image" | "video";
  url?: string;
  posterUrl?: string;
  mp4Url?: string;
  webmUrl?: string;
}

/** The union the overlay's applyEdits handler accepts (media live-swap + inline-text re-apply). */
export type ApplyEdit = MediaPreview | { field: string; kind: "text"; text: string };

/**
 * An inbound message that has passed the origin + source gate. Deliberately loose: the gate proves
 * it came from our overlay, not that any particular field is present, so every field reads back as
 * `unknown` and each of the shell's branches narrows what it actually uses. That is the same
 * contract the raw `MessageEvent.data` (typed `any`) gave the shell before — minus the `any`.
 */
export type BridgeMessage = Record<string, unknown> & { type?: string };

export interface PreviewBridge {
  postMode(m: EditMode): void;
  postRefresh(): void;
  postHighlight(field: string): void;
  postScrollToBlock(blockKey: string): void;
  postApplyEdits(edits: ApplyEdit[]): void;
  postApplyPalette(css: string): void;
  /**
   * Ask the overlay which of these stored override selectors no longer match exactly one element.
   * Only the preview can answer — the admin has no DOM for the page. The reply is a
   * `{ type:"selectorAudit", broken }` message on the inbound channel.
   */
  postAuditSelectors(selectors: string[]): void;
}

/** Just enough of an `<iframe>` ref for the bridge to post at — and little enough for a test to
 *  fake without a DOM. A real `RefObject<HTMLIFrameElement | null>` satisfies it structurally. */
export type PreviewTargetRef = {
  readonly current: { readonly contentWindow: Window | null } | null;
};

/**
 * The outbound half, over a ref to the preview iframe.
 *
 * The target is re-read from the ref on every post rather than captured once: the <iframe> is keyed
 * on locale+surface, so React destroys and recreates it (and its contentWindow) mid-session, and a
 * captured window would address the DEAD document forever after the first navigation. A missing
 * window is a silent no-op — posts genuinely do race the first load, and `ready` is what recovers
 * from that (see the shell's handler).
 */
export function createPreviewBridge(target: PreviewTargetRef, webOrigin: string): PreviewBridge {
  const post = (message: Record<string, unknown>) => {
    target.current?.contentWindow?.postMessage({ source: SOURCE, ...message }, webOrigin);
  };
  return {
    postMode: (m) => post({ type: "setMode", mode: m }),
    postRefresh: () => post({ type: "refresh" }),
    postHighlight: (field) => post({ type: "highlight", field }),
    postScrollToBlock: (blockKey) => post({ type: "scrollToBlock", blockKey }),
    postApplyEdits: (edits) => post({ type: "applyEdits", edits }),
    postApplyPalette: (css) => post({ type: "applyPalette", css }),
    postAuditSelectors: (selectors) => post({ type: "auditSelectors", selectors }),
  };
}

/**
 * The inbound gate: the payload if the message is one of ours, else null.
 *
 * A gate and nothing more — it never inspects `type` or the fields under it, so the shell's branches
 * stay the single place that decides what a message means, and a new message type needs no edit here.
 */
export function readBridgeMessage(
  e: { origin: string; data: unknown },
  webOrigin: string,
): BridgeMessage | null {
  if (e.origin !== webOrigin) return null;
  const data = e.data;
  if (!data || typeof data !== "object") return null;
  if ((data as { source?: unknown }).source !== SOURCE) return null;
  return data as BridgeMessage;
}

/**
 * Wire a bridge to an iframe ref: posters out, one `window` message listener in.
 *
 * The listener subscribes ONCE per origin, so `onMessage` is held as an effect event — it runs the
 * LATEST render's handler on every message without ever re-subscribing. That matters twice over:
 *   • The handler must read live values. `ready` is the only guaranteed-delivery moment (a post to a
 *     loading document is dropped on the floor), so it re-asserts the editor's current state — and
 *     "current" has to mean at MESSAGE time, not at subscribe time.
 *   • It frees `onMessage` from having to be referentially stable, which is what lets the shell's
 *     handler post back through the very bridge this hook returns.
 */
export function usePreviewBridge({
  iframeRef,
  webOrigin,
  onMessage,
}: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  webOrigin: string;
  onMessage: (data: BridgeMessage) => void;
}): PreviewBridge {
  // The ref OBJECT is handed over whole, never `.current` — reading it here would be a read during
  // render (and would staple the bridge to whichever document was mounted at the time).
  const bridge = useMemo(() => createPreviewBridge(iframeRef, webOrigin), [iframeRef, webOrigin]);

  const onBridgeMessage = useEffectEvent((data: BridgeMessage) => onMessage(data));

  useEffect(() => {
    const listener = (e: MessageEvent) => {
      const data = readBridgeMessage(e, webOrigin);
      if (data) onBridgeMessage(data);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [webOrigin]);

  return bridge;
}
