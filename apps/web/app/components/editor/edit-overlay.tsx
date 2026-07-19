"use client";

// app/components/editor/edit-overlay.tsx
// Visual-editor overlay — rendered ONLY inside the /preview editor route (never on public pages).
// On mount it scans the DOM for [data-edit-field] zones (stamped by editable() in the shared section
// components when editable=1) and wires inline editing:
//   • MEDIA (caps image|video) — a floating "hotspot" layer is the hover + click surface for the
//     media (it may be covered by content, so it lives above the page; click → admin drawer).
//   • TEXT  (cap text)         — the span itself becomes contentEditable IN PLACE; the committed
//     value is postMessage'd back to the admin (no hotspot for text — Plan-4 gate (a)).
//   • COLOUR (any element)     — resolved from the click's paint stack by color-engine.ts, not from
//     a cap: a click reports its roles to the admin, which renders them in the colour panel.
//
// CAPABILITIES vs MODE. An element declares what it CAN do via `data-edit-caps` (a comma-joined
// list — see _lib/edit-caps.ts), and the active MODE (see _lib/edit-mode.ts) decides which of those
// a click invokes. hero.titleBottom is both text- and colour-editable; without a mode, one click has
// to guess. With one, exactly one kind of thing is clickable at a time and a click is never
// ambiguous — which is also what lets the affordances be gated on mutually exclusive selectors
// instead of racing each other on specificity/source order. Mode arrives from the admin's toolbar
// over the bridge (`setMode`); it is UI state only — never persisted, never in the public render.
//
// WHY A FLOATING HOTSPOT LAYER FOR MEDIA (not listeners + a badge ON the media element):
//   1. Many media are visually COVERED by content — the home hero image sits behind the headline +
//      quote form; a testimonial still sits under a slider layer. A click on the visible image lands
//      on that overlaid content, not the <img>, so a listener on the <img> never fires. The hotspots
//      live in a body-level layer with a very high z-index, ABOVE all page content, so the WHOLE
//      visible image is clickable regardless of what's painted on top of it.
//   2. The previous approach anchored a badge by forcing the media's PARENT to position:relative.
//      That reparented absolutely-positioned media (e.g. the footer's .palm-footer lotus) and broke
//      the footer layout. The hotspot layer NEVER mutates the page's own DOM/layout — it only mirrors
//      each element's viewport rect — so the rendered page stays byte-identical to the public site.
//
// postMessage protocol (both directions use { source: "signex-editor", ... }):
//   preview → admin:  { source, type: "edit", field, mediaKind: "image"|"video", flexible: boolean } // open media drawer; flexible = slot carries both caps
//                     { source, type: "textEdit", field, value }                       // committed inline text edit
//                     { source, type: "colorTarget", field, blockKey, label, rect, roles } // colour click → fill the colour panel
//                     { source, type: "selectorAudit", broken }                        // reply to auditSelectors — stored selectors that no longer match
//                     { source, type: "highlight", field }                             // canvas leaf focused (→ flash panel field)
//                     { source, type: "ready" }                                        // handshake on mount — admin re-applies pending edits
//   admin   → preview: { source, type: "refresh" }                                     // reload to show the just-saved working state
//                     { source, type: "auditSelectors", selectors }                    // which stored override selectors are dead? (→ selectorAudit)
//                     { source, type: "setMode", mode: "media"|"text"|"color"|"content" } // which capability a click invokes
//                     { source, type: "highlight", field }                             // panel field focused (→ flash canvas leaf; Task 7)
//                     { source, type: "applyEdits", edits:[…] }                         // live DOM swap (no reload)
//                     { source, type: "applyPalette", css }                            // live re-theme of #signex-palette (no reload; Task 6)
//     applyEdits edit shapes:
//       { field, kind:"image", url? } | { field, kind:"video", posterUrl?, mp4Url?, webmUrl? }
//       { field, kind:"text",  text }   // re-apply unsaved pending inline text after a refresh/remount
//
// SECURITY: we postMessage with targetOrigin "*" for simplicity in this internal tool (the admin
// VERIFIES event.origin on receipt). The inbound listener does NOT restrict origin so dev across
// localhost ports keeps working; only the literal { source:"signex-editor", … } shapes are honoured.
// PROD follow-up: pin targetOrigin to the admin origin and verify event.origin here too.

import { useEffect } from "react";

import { resolveMeaningfulBlock, resolveRoles } from "./_lib/color-engine";
import { capSel, hasCap, type EditCap } from "./_lib/edit-caps";
import {
  MODE_AFFORDANCE_CSS,
  DEFAULT_EDIT_MODE,
  isEditMode,
  modeScope,
  type EditMode,
} from "./_lib/edit-mode";
// Page-stamped marks come from overlay-classes.ts as CONSTANTS, never as literals here: the class
// names and the selector-generation filter that must ignore them are one decision, and a literal
// spelled at the point of use is how they drift apart. See the rule stated there.
import { CLASS_COLOR_HOVER, CLASS_FLASH } from "./_lib/overlay-classes";

const SOURCE = "signex-editor";

// The two known locales (kept literal — i18n-config is a server module; the overlay is a tiny
// dependency-free client). Used to strip a leading /<locale> off intercepted hrefs.
const LOCALES = ["en", "vi"] as const;

type MediaEntry = { el: HTMLElement; hot: HTMLDivElement; onScreen: boolean };

/** The capability-aware `closest()`: nearest ancestor-or-self DECLARING `cap`. A plain
 *  `closest("[data-edit-caps]")` would stop at the first stamped element even when it lacks `cap`,
 *  so keep walking past those rather than giving up. */
function closestCap(start: Element | null | undefined, cap: EditCap): HTMLElement | null {
  let node = start?.closest?.("[data-edit-caps]") as HTMLElement | null;
  while (node) {
    if (hasCap(node, cap)) return node;
    node = node.parentElement?.closest("[data-edit-caps]") as HTMLElement | null;
  }
  return null;
}

/** A slot that can hold EITHER an image or a video (both caps) — the only place applyEdits may need
 *  to REPLACE the media element (an image↔video swap), not just tweak its src. */
function isFlexibleMedia(el: HTMLElement): boolean {
  return hasCap(el, "image") && hasCap(el, "video");
}

/**
 * Build the replacement media element for a flexible slot whose kind just changed (image↔video),
 * carrying the old element's class + data-edit-* so it stays positioned and editable.
 *
 * Why replacing a PAGE element here does NOT break overlay-classes' child-mutation rule (which
 * exists to keep generated colour selectors honest): a flexible media slot is a LEAF media element
 * (an <img>, or a <video>/its Webflow wrapper) — never an ancestor of a colour-anchored element — so
 * swapping its tag cannot change any colour selector's path. It is also transient: a save + preview
 * refresh re-renders the exact server markup (content.ts + the component), the real source of truth.
 */
function buildFlexibleMediaEl(
  kind: "image" | "video",
  ed: { url?: string; posterUrl?: string; mp4Url?: string; webmUrl?: string },
  from: HTMLElement,
): HTMLElement {
  const field = from.getAttribute("data-edit-field") ?? "";
  const caps = from.getAttribute("data-edit-caps") ?? "";
  const stamp = (node: HTMLElement) => {
    node.className = from.className;
    node.setAttribute("data-edit-field", field);
    node.setAttribute("data-edit-caps", caps);
  };
  if (kind === "image") {
    const img = document.createElement("img");
    stamp(img);
    img.loading = "lazy";
    img.src = ed.url ?? "";
    return img;
  }
  const video = document.createElement("video");
  stamp(video);
  video.autoplay = true;
  video.muted = true; // property AND attribute — some engines require the attribute for autoplay
  video.setAttribute("muted", "");
  video.loop = true;
  video.playsInline = true;
  if (ed.posterUrl) video.poster = ed.posterUrl;
  if (ed.mp4Url) {
    const s = document.createElement("source");
    s.src = ed.mp4Url;
    s.type = "video/mp4";
    video.appendChild(s);
  }
  if (ed.webmUrl) {
    const s = document.createElement("source");
    s.src = ed.webmUrl;
    s.type = "video/webm";
    video.appendChild(s);
  }
  return video;
}

type EditState = {
  el: HTMLElement;
  field: string;
  original: string;
  multiline: boolean;
  max: number;
  composing: boolean;
  cleanup: () => void;
};

export function EditOverlay() {
  useEffect(() => {
    let disposed = false;

    // The active mode — which capability a click invokes. An effect-scoped `let`, not React state:
    // every listener below subscribes once, so they must read the LIVE value, and re-running this
    // effect per mode change would tear down and rebuild the whole hotspot layer. The CSS half of
    // the gate reads it off body.dataset.sxMode instead (kept in step by onMessage, below).
    // The default is DEFAULT_EDIT_MODE ("content"): until the admin says otherwise, the canvas is
    // read-only. It comes from @signex/shared rather than a literal because the admin toolbar boots
    // from the same constant — a preview that never receives a `setMode` has to agree with the
    // toolbar, and two independently-spelled defaults is exactly how that stops being true.
    let mode: EditMode = DEFAULT_EDIT_MODE;

    // ---- styles (injected once) ----------------------------------------------------------
    const style = document.createElement("style");
    style.setAttribute("data-signex-editor", "");
    style.textContent = `
      .sx-edit-layer {
        position: fixed; inset: 0; z-index: 2147483000; pointer-events: none;
      }
      .sx-edit-hotspot {
        position: absolute; box-sizing: border-box;
        pointer-events: auto; cursor: pointer;
        border: 2px solid transparent; border-radius: 2px;
        background: transparent;
        transition: background-color .12s ease, border-color .12s ease;
      }
      .sx-edit-hotspot:hover { border-color: #4956e3; background: rgba(73,86,227,0.10); }
      .sx-edit-badge {
        position: absolute; top: 6px; left: 6px;
        display: inline-flex; align-items: center; gap: 4px;
        max-width: calc(100% - 12px);
        padding: 4px 8px; border-radius: 6px;
        background: #4956e3; color: #fff;
        font: 600 12px/1.1 ui-sans-serif, system-ui, sans-serif;
        box-shadow: 0 1px 4px rgba(0,0,0,.3);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        opacity: 0; transition: opacity .12s ease; pointer-events: none;
      }
      .sx-edit-hotspot:hover .sx-edit-badge { opacity: 1; }

      /* The mode-gated affordances (text/colour/hotspot visibility). Kept in edit-mode.ts next to
         isEditMode so a static test can read the cascade they produce — the CSS that PAINTS an
         affordance and the dispatch that HONOURS it must agree on which mode does what, and a
         disagreement between them is silent. */
      ${MODE_AFFORDANCE_CSS}
      /* The active inline edit. Gated for consistency with the rest, though it is belt-and-braces:
         it can only match while contentEditable is on, which only text mode turns on — and leaving
         text mode commits the edit, which turns it back off. */
      ${capSel("text", '[contenteditable="true"]', modeScope("text"))} {
        outline: 2px solid #4956e3; outline-offset: 2px; background: rgba(73,86,227,.06);
      }
      .${CLASS_FLASH} { animation: sx-flash .9s ease; }
      @keyframes sx-flash {
        0%,100% { outline-color: transparent; }
        25% { outline: 2px solid #4956e3; outline-offset: 2px; }
      }
    `;
    document.head.appendChild(style);

    // Publish the starting mode rather than leaving the attribute absent. An absent attribute
    // happens to gate identically to "content" (every rule is either `[data-sx-mode="…"]`, which
    // can't match, or `:not([data-sx-mode="…"])`, which does) — but that is a coincidence of the
    // current rules, not a contract, and it would leave the admin unable to read the mode back.
    document.body.dataset.sxMode = mode;

    // ---- hotspot layer: a fixed, page-layout-neutral overlay that holds one hotspot per MEDIA zone ----
    const layer = document.createElement("div");
    layer.className = "sx-edit-layer";
    document.body.appendChild(layer);

    // ============================================================================================
    //  Position sync (Task 8) — declared first so the media click handlers can schedule it.
    //  Replaces the Plan-3 always-on requestAnimationFrame loop with an OBSERVER-DRIVEN model:
    //  sync() runs on demand (Lenis scroll / native scroll+wheel+touch / Resize+Intersection
    //  observers / explicit nudges), coalesced to one layout pass per frame. Idle ⇒ zero work.
    // ============================================================================================
    let scheduled = false;
    let rafId = 0;
    const entries: MediaEntry[] = [];

    const sync = () => {
      if (disposed) return;
      // Only media mode shows hotspots; every other mode hides the whole layer in CSS, so measuring
      // it would be pure waste on every scroll frame. Switching back to media calls scheduleSync().
      if (mode !== "media") return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      for (const entry of entries) {
        if (!entry.onScreen) {
          if (entry.hot.style.display !== "none") entry.hot.style.display = "none";
          continue;
        }
        const r = entry.el.getBoundingClientRect();
        const left = Math.max(0, r.left);
        const top = Math.max(0, r.top);
        const right = Math.min(vw, r.right);
        const bottom = Math.min(vh, r.bottom);
        const w = right - left;
        const h = bottom - top;
        if (w <= 2 || h <= 2) {
          if (entry.hot.style.display !== "none") entry.hot.style.display = "none";
          continue;
        }
        entry.hot.style.display = "block";
        entry.hot.style.left = `${left}px`;
        entry.hot.style.top = `${top}px`;
        entry.hot.style.width = `${w}px`;
        entry.hot.style.height = `${h}px`;
      }
    };

    // Coalesce bursts (multiple triggers in one frame ⇒ a single layout pass).
    const scheduleSync = () => {
      if (disposed || scheduled) return;
      scheduled = true;
      rafId = requestAnimationFrame(() => {
        scheduled = false;
        sync();
      });
    };

    // ============================================================================================
    //  Inline TEXT editing (Task 4 + the five gates of Task 5).
    // ============================================================================================
    let editing: EditState | null = null;

    // Post-commit / post-apply reflow nudge (Task 5c). Editing text changes element heights, which
    // leaves GSAP/ScrollTrigger parallax/pin/reveal offsets stale; mirror webflow-runtime.tsx step 5
    // and also re-run the hotspot positioner (Task 8) for the new geometry.
    let nudgeRaf = 0;
    const nudgeReflow = () => {
      nudgeRaf = requestAnimationFrame(() => {
        if (disposed) return;
        window.ScrollTrigger?.refresh();
        window.dispatchEvent(new Event("resize"));
        window.dispatchEvent(new Event("scroll"));
        scheduleSync();
      });
    };

    const endEdit = (s: EditState) => {
      s.cleanup();
      s.el.contentEditable = "false";
    };

    const commit = () => {
      if (!editing) return;
      const s = editing;
      editing = null;
      // Flatten any stray nodes back to a single text node — guarantees the span never keeps
      // injected markup (a paste/drop or multiline <br> can never survive a commit).
      s.el.textContent = s.el.textContent ?? "";
      endEdit(s);
      window.getSelection()?.removeAllRanges();
      const value = s.el.textContent ?? "";
      if (value !== s.original) {
        window.parent.postMessage({ source: SOURCE, type: "textEdit", field: s.field, value }, "*");
      }
      nudgeReflow();
    };

    const revert = () => {
      if (!editing) return;
      const s = editing;
      editing = null;
      s.el.textContent = s.original;
      endEdit(s);
      s.el.blur();
    };

    const beginEdit = (el: HTMLElement, x: number, y: number) => {
      if (editing) {
        if (editing.el === el) return; // already editing this leaf
        commit(); // switching leaves — commit the current one first
      }
      const field = el.getAttribute("data-edit-field") ?? "";
      const multiline = el.dataset.editMultiline === "true";
      const max = Number(el.dataset.editMaxlength) || 0;
      const state: EditState = {
        el,
        field,
        original: el.textContent ?? "",
        multiline,
        max,
        composing: false,
        cleanup: () => {},
      };

      // Max-length is client-side UX ONLY (no schema involvement). Never trim mid-composition, or a
      // half-formed IME glyph would be corrupted; compositionend re-checks.
      const enforceMax = () => {
        if (!state.max || state.composing) return;
        if ((el.textContent?.length ?? 0) > state.max) {
          el.textContent = (el.textContent ?? "").slice(0, state.max);
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false); // caret → end
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      };

      // Insert plain text at the caret via a Range (no execCommand) so the span never gains child
      // markup. Single-line leaves additionally collapse any newlines to spaces.
      const insertPlainText = (raw: string) => {
        const text = state.multiline ? raw : raw.replace(/[\r\n]+/g, " ");
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
          el.textContent = (el.textContent ?? "") + text;
        } else {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const node = document.createTextNode(text);
          range.insertNode(node);
          range.setStartAfter(node);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        enforceMax();
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          revert();
          return;
        }
        if (e.key === "Enter") {
          if (state.multiline) {
            if (e.metaKey || e.ctrlKey) {
              e.preventDefault();
              commit();
              return;
            }
            // Plain Enter in a multiline field → a literal newline, never a <br>/<div>.
            e.preventDefault();
            insertPlainText("\n");
            return;
          }
          // Single-line: Enter commits — but NOT while composing (gate (e)), so Enter that just
          // confirms an IME candidate doesn't prematurely commit.
          if (!e.isComposing) {
            e.preventDefault();
            commit();
          }
        }
      };
      const onInput = () => enforceMax();
      const onPaste = (e: ClipboardEvent) => {
        e.preventDefault();
        insertPlainText(e.clipboardData?.getData("text/plain") ?? "");
      };
      const onDrop = (e: DragEvent) => {
        e.preventDefault();
        insertPlainText(e.dataTransfer?.getData("text/plain") ?? "");
      };
      const onCompositionStart = () => {
        state.composing = true;
      };
      const onCompositionEnd = () => {
        state.composing = false;
        enforceMax();
      };
      // IME gate (e): a blur landing mid-composition (Vietnamese Telex/VNI) would drop the final
      // composed glyph (e.g. `ờ` = o+w+f). Defer the commit a macrotask so compositionend lands
      // first and the composed characters are kept.
      const onBlur = () => {
        if (state.composing) {
          setTimeout(() => {
            if (editing === state && !state.composing) commit();
          }, 0);
          return;
        }
        commit();
      };

      el.addEventListener("keydown", onKeyDown);
      el.addEventListener("input", onInput);
      el.addEventListener("paste", onPaste);
      el.addEventListener("drop", onDrop);
      el.addEventListener("compositionstart", onCompositionStart);
      el.addEventListener("compositionend", onCompositionEnd);
      el.addEventListener("blur", onBlur);
      state.cleanup = () => {
        el.removeEventListener("keydown", onKeyDown);
        el.removeEventListener("input", onInput);
        el.removeEventListener("paste", onPaste);
        el.removeEventListener("drop", onDrop);
        el.removeEventListener("compositionstart", onCompositionStart);
        el.removeEventListener("compositionend", onCompositionEnd);
        el.removeEventListener("blur", onBlur);
      };

      editing = state;
      el.contentEditable = "true";
      // gate (d): preventScroll so entering edit never yanks the Lenis smooth-scroll position. We
      // deliberately do NOT call any window.__lenis scroll method on focus (no scrollIntoView here).
      el.focus({ preventScroll: true });
      // Place the caret at the click point (best-effort; otherwise the focus default caret stands).
      const r = (document as { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.(x, y);
      if (r) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }

      // canvas → panel half of the two-way highlight (the admin flashes/selects the matching panel
      // field; Task 7 consumes this inbound message).
      window.parent.postMessage({ source: SOURCE, type: "highlight", field }, "*");
    };

    // ---- media zones only (caps image|video). TEXT zones get NO hotspot — Plan-4 gate (a): the
    // scan matches only the media caps, so a text leaf never gets an "Edit image" badge (text is
    // edited in place by the contentEditable path above).
    const fields = Array.from(
      document.querySelectorAll<HTMLElement>(`${capSel("image")},${capSel("video")}`),
    );

    for (const el of fields) {
      const field = el.getAttribute("data-edit-field") ?? "";
      const mediaKind: "image" | "video" = hasCap(el, "image") ? "image" : "video";
      // A slot stamped with BOTH caps (Tasks 4–6's four flexible slots) can hold either kind — the
      // admin picker offers the Ảnh/Video toggle only when this is true (Task 9).
      const flexible = hasCap(el, "image") && hasCap(el, "video");

      const hot = document.createElement("div");
      hot.className = "sx-edit-hotspot";
      hot.style.display = "none"; // shown by sync() once its element has a visible rect

      const badge = document.createElement("span");
      badge.className = "sx-edit-badge";
      badge.textContent = `Edit ${mediaKind} · ${field}`;
      hot.appendChild(badge);

      // The hotspot sits above ALL page content, so a full-bleed media (e.g. the hero image, which
      // sits UNDER the headline + nav) can cover real controls. elementsFromPoint returns the FULL
      // stack, seeing THROUGH the (pointer-transparent) hotspot layer, so we can find what a click
      // would really have landed on.
      const topmostUnder = (x: number, y: number) =>
        (document.elementsFromPoint(x, y) as HTMLElement[]).find((n) => !n.closest(".sx-edit-layer")) ??
        null;

      const onClick = (e: MouseEvent) => {
        // A hotspot only receives clicks in media mode (CSS hides the layer otherwise), so a click
        // here means the media. This used to first look for a text leaf under the pointer and edit
        // THAT instead — text painted over an image had to win, because text and media were both
        // live at once and the click was genuinely ambiguous. Mode is what resolved that: text is
        // reached in text mode, where the hotspots aren't in the way at all. Deferring to text here
        // as well would put back the ambiguity — and would mean the parts of an image behind text
        // (most of the hero) still could not be clicked in the one mode that exists to edit images.

        // 1) A navigation LINK genuinely painted OVER the media → re-dispatch so the user can
        //    navigate (the document interceptor rewrites internal links to /preview). Deliberately
        //    NOT buttons/inputs: the hero quote-form submit sits under the hero hotspot, and
        //    re-dispatching to it would POST a junk lead — clicking there edits the image.
        const control = topmostUnder(e.clientX, e.clientY)?.closest?.("a[href]") as HTMLElement | null;
        if (control && control !== el && !el.contains(control) && !control.contains(el)) {
          control.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: e.clientX,
              clientY: e.clientY,
            }),
          );
          return;
        }

        // 2) Otherwise: edit the media.
        e.preventDefault();
        e.stopPropagation();
        window.parent.postMessage({ source: SOURCE, type: "edit", field, mediaKind, flexible }, "*");
      };
      hot.addEventListener("click", onClick);
      layer.appendChild(hot);

      entries.push({ el, hot, onScreen: true });
    }

    // ---- ready handshake: tell the admin shell the overlay is live so it should re-apply any
    // pending media swaps AND pending inline text (admin re-posts both via applyEdits). Sent AFTER
    // entries are built so the overlay can receive the follow-up applyEdits immediately.
    window.parent.postMessage({ source: SOURCE, type: "ready" }, "*");

    // ---- observers + listeners that drive sync() (Task 8) ----------------------------------------
    const byEl = new Map<Element, MediaEntry>();
    for (const entry of entries) byEl.set(entry.el, entry);

    // IntersectionObserver: maintain the on-screen set so sync() can skip getBoundingClientRect for
    // off-screen media (toggle display instead of recomputing every element each frame).
    const io = new IntersectionObserver(
      (obs) => {
        for (const o of obs) {
          const entry = byEl.get(o.target);
          if (entry) entry.onScreen = o.isIntersecting;
        }
        scheduleSync();
      },
      { root: null, threshold: 0 },
    );
    for (const entry of entries) io.observe(entry.el);

    // ResizeObserver: layout/reflow of the page body or any media element (also picks up the
    // post-commit text reflow from Task 5c) → reposition.
    const ro = new ResizeObserver(() => scheduleSync());
    ro.observe(document.body);
    for (const entry of entries) ro.observe(entry.el);

    // Native scroll input. Lenis smooth-scroll moves content by TRANSFORM and emits its own "scroll"
    // event each frame (no native scroll) — so subscribe to Lenis when present; the native
    // scroll/wheel/touch listeners are the fallback when Lenis is absent or not yet booted.
    const onWinEvent = () => scheduleSync();
    window.addEventListener("scroll", onWinEvent, { passive: true });
    window.addEventListener("resize", onWinEvent, { passive: true });
    window.addEventListener("wheel", onWinEvent, { passive: true });
    window.addEventListener("touchmove", onWinEvent, { passive: true });

    // Lenis is created asynchronously by webflow-runtime.tsx AFTER its scripts load (later than this
    // effect), so poll briefly until it exists, then subscribe. Preview navigation is a full reload
    // (overlay remounts), so Lenis is created exactly once per overlay lifetime.
    let lenis: { on?: (e: string, cb: () => void) => void; off?: (e: string, cb: () => void) => void } | null = null;
    const onLenisScroll = () => scheduleSync();
    let attachTries = 0;
    let attachTimer = 0;
    const tryAttachLenis = (): boolean => {
      const l = window.__lenis;
      if (l && typeof l.on === "function") {
        lenis = l;
        l.on("scroll", onLenisScroll);
        scheduleSync();
        return true;
      }
      return false;
    };
    if (!tryAttachLenis()) {
      attachTimer = window.setInterval(() => {
        attachTries += 1;
        if (tryAttachLenis() || attachTries > 50) window.clearInterval(attachTimer);
      }, 200);
    }

    // One-shot initial position.
    scheduleSync();

    // ---- colour mode: track what a click would select ---------------------------------------
    // Text's affordance is a pure-CSS :hover rule, because a text target IS the element under the
    // pointer. Colour's can't be: its target is resolved from the paint STACK (the topmost node is
    // usually a meaningless .gsap_split_word fragment), so the outline has to be moved by JS to
    // whatever resolveMeaningfulBlock would return — i.e. exactly what the click below will act on.
    let colorHover: HTMLElement | null = null;
    const setColorHover = (el: HTMLElement | null) => {
      if (el === colorHover) return;
      colorHover?.classList.remove(CLASS_COLOR_HOVER);
      colorHover = el;
      el?.classList.add(CLASS_COLOR_HOVER);
    };
    // Coalesce to one hit-test per frame: mousemove fires far faster, and each resolve forces layout
    // on a page already running GSAP + Lenis every frame.
    let hoverPt: { x: number; y: number } | null = null;
    let hoverRaf = 0;
    const onDocMove = (e: MouseEvent) => {
      if (mode !== "color") return;
      hoverPt = { x: e.clientX, y: e.clientY };
      if (hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0;
        if (disposed || mode !== "color" || !hoverPt) return;
        setColorHover(resolveMeaningfulBlock(hoverPt.x, hoverPt.y));
      });
    };
    const onDocLeave = () => setColorHover(null);
    document.addEventListener("mousemove", onDocMove, { passive: true });
    document.addEventListener("mouseleave", onDocLeave);

    // ---- internal navigation interception + inline-text click → enter edit -----------------------
    // The shared section components render PUBLIC hrefs (`/`, `/about`, `/contact`, …). Following them
    // would navigate the iframe OUT of /preview (no token/editable flag, no [data-edit-field]). We
    // intercept same-origin link clicks and redirect to the /preview equivalent. We ALSO claim clicks
    // on inline-text leaves here (capture phase) so they enter edit mode before the anchor/Webflow
    // runtime can act on them.
    const onDocClick = (e: MouseEvent) => {
      // MODE ROUTES THE CLICK. Each branch below is the dispatch half of an affordance painted by
      // MODE_AFFORDANCE_CSS under the same gate — the two must name the same mode or the canvas
      // advertises an edit it won't perform. media/content fall through to the link interception:
      // media is dispatched by the hotspot layer's own handler, and content is a read-only canvas
      // whose only interaction IS navigation.

      // Inline TEXT: a click on an element declaring the "text" cap enters edit mode in place. Many
      // text leaves live inside an <a> (nav/footer labels, the features CTA) — preventDefault/stopProp
      // so clicking to edit never navigates.
      if (mode === "text") {
        // closestCap, not closest("[data-edit-caps]") + hasCap: the nearest STAMPED ancestor is
        // frequently not the nearest TEXT-capable one (a colour-only anchor wrapping a text leaf's
        // parent), and stopping at it would silently drop the edit.
        const textLeaf = closestCap(e.target as Element | null, "text");
        if (textLeaf) {
          e.preventDefault();
          e.stopPropagation();
          if (editing && editing.el === textLeaf) return; // already editing — let the caret move
          beginEdit(textLeaf, e.clientX, e.clientY);
          return;
        }
      }

      // COLOUR: report what was clicked; the admin's colour panel renders it. The target is resolved
      // from the paint stack rather than from a cap — colour is editable on ANY element, so there is
      // nothing to have stamped. Many candidates live inside an <a> (e.g. the nav CTA) —
      // preventDefault / stopPropagation BEFORE the navigation interception below so the click never
      // navigates.
      if (mode === "color") {
        const block = resolveMeaningfulBlock(e.clientX, e.clientY);
        if (block) {
          e.preventDefault();
          e.stopPropagation();
          const field = block.getAttribute("data-edit-field") ?? "";
          window.parent.postMessage(
            {
              source: SOURCE,
              type: "colorTarget",
              blockKey: block.closest("[data-sx-block]")?.getAttribute("data-sx-block") ?? "",
              label: field || block.tagName.toLowerCase(),
              // Per role: the rendered hex, the token driving it, and a selector for a per-element
              // override. Only this frame can answer any of it — most tokens carry no stored value
              // (they derive from a seed), so the palette cannot say what colour this element is.
              roles: resolveRoles(block),
            },
            "*",
          );
          return;
        }
      }

      // Honour the media-zone editor clicks (handled above) and modified clicks (new-tab etc.).
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const raw = anchor.getAttribute("href");
      if (!raw) return;
      // In-page anchors (#…, #quote-form) and external/protocol links → let the browser handle.
      if (raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) return;
      // Only same-origin absolute paths are rewritten. Anything with a scheme/host (http(s)://,
      // //cdn…) is external — leave it.
      if (!raw.startsWith("/") || raw.startsWith("//")) return;
      // Already a /preview link → let it through unchanged (still token-bearing).
      if (raw === "/preview" || raw.startsWith("/preview/")) return;

      // Derive the current preview locale + secret from the iframe's own URL.
      const here = window.location;
      const hereSegments = here.pathname.split("/"); // ["", "preview", "<lang>", …]
      const lang = (LOCALES as readonly string[]).includes(hereSegments[2])
        ? hereSegments[2]
        : LOCALES[1]; // default vi (matches DEFAULT_LOCALE)
      const secret = new URLSearchParams(here.search).get("secret") ?? "";
      const theme = new URLSearchParams(here.search).get("theme") ?? "";

      // Normalize the target: drop the query/hash, then strip a leading /<locale> →
      // logicalPath ("" for home, "/about", "/contact", "/products/x", …).
      const path = raw.split(/[?#]/)[0];
      const segs = path.split("/"); // ["", "vi", "about"] or ["", "about"] or [""]
      if ((LOCALES as readonly string[]).includes(segs[1])) segs.splice(1, 1);
      const logicalPath = segs.join("/").replace(/^\/+/, "/").replace(/^\/$/, "");

      e.preventDefault();
      const qs = `?secret=${encodeURIComponent(secret)}&editable=1${theme ? `&theme=${encodeURIComponent(theme)}` : ""}`;
      window.location.assign(`/preview/${lang}${logicalPath}${qs}`);
    };
    // Capture phase so we intercept before the Webflow runtime / anchor default navigation.
    document.addEventListener("click", onDocClick, true);

    // ---- inbound: parent → preview messages ------------------------------------------------
    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || typeof data !== "object" || data.source !== SOURCE) return;

      if (data.type === "refresh") {
        window.location.reload();
        return;
      }

      // setMode: the admin's toolbar decides which capability a click invokes. isEditMode, not
      // `typeof data.mode === "string"`: this crosses a window boundary, and an unrecognised value
      // would gate every affordance off while dispatch fell through every branch — a canvas that
      // looks read-only but isn't in any mode the code names.
      if (data.type === "setMode" && isEditMode(data.mode)) {
        mode = data.mode;
        document.body.dataset.sxMode = data.mode; // the CSS half of the gate reads this
        if (editing) commit(); // don't strand an in-flight text edit in a mode that can't finish it
        if (mode !== "color") setColorHover(null); // else the outline outlives its mode
        scheduleSync(); // hotspots were unmeasured while hidden — reposition before they show
        return;
      }

      // applyPalette: live re-theme without reload. Task 3 renders a `#signex-palette` <style> node
      // at initial SSR when a palette is already set; find-or-create it here since a page rendered
      // with NO palette yet (first live edit) won't have the node at all.
      if (data.type === "applyPalette") {
        let styleEl = document.getElementById("signex-palette") as HTMLStyleElement | null;
        if (!styleEl) {
          styleEl = document.createElement("style");
          styleEl.id = "signex-palette";
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = typeof data.css === "string" ? data.css : "";
        return;
      }

      // auditSelectors: which of the palette's stored override selectors no longer point at exactly
      // one element? Only this frame can answer — the admin has no DOM for the page. A selector
      // DRIFTS: it was proven unique when it was minted, and then a nav link was added, or a list
      // item removed, and an `:nth-of-type` in it stopped meaning what it meant. Reported, never
      // auto-removed: deleting a colour the user chose, because a selector drifted, would be worse
      // than showing it broken — so the admin lists them and the user decides.
      if (data.type === "auditSelectors" && Array.isArray(data.selectors)) {
        const broken = (data.selectors as string[]).filter((sel) => {
          try {
            // !== 1, not === 0: a selector matching SEVERAL elements is broken too — it now paints
            // things the user never picked, which is the failure that looks like it works.
            return document.querySelectorAll(sel).length !== 1;
          } catch {
            return true; // unparseable here = dead here
          }
        });
        window.parent.postMessage({ source: SOURCE, type: "selectorAudit", broken }, "*");
        return;
      }

      // highlight (panel→canvas half of the two-way highlight; Task 7). The admin posts the focused
      // panel field's snapshot path (locale-agnostic — matches data-edit-field). Find the matching
      // leaf and flash it with the pre-shipped CLASS_FLASH class (~900ms). scrollIntoView uses "auto"
      // when Lenis is present so the instant jump isn't fought by the smooth-scroll engine.
      if (data.type === "highlight" && typeof data.field === "string") {
        const el = document.querySelector<HTMLElement>(
          `[data-edit-field="${CSS.escape(data.field)}"]`,
        );
        if (el) {
          el.scrollIntoView({ block: "center", behavior: window.__lenis ? "auto" : "smooth" });
          el.classList.remove(CLASS_FLASH); // restart the animation if it's mid-flight
          // Force reflow so re-adding the class re-triggers the keyframe.
          void el.offsetWidth;
          el.classList.add(CLASS_FLASH);
          window.setTimeout(() => el.classList.remove(CLASS_FLASH), 900);
        }
        return;
      }

      // scrollToBlock (navigator→canvas): the admin clicked a section in the left navigator. Scroll
      // that block's region into view and flash ALL its zones so the user sees what they're editing.
      // Settings-only blocks (meta/businessContact/formConfig) have no stamped zones → no-op here.
      if (data.type === "scrollToBlock" && typeof data.blockKey === "string") {
        const els = [
          ...document.querySelectorAll<HTMLElement>(
            `[data-edit-field^="${CSS.escape(data.blockKey)}."]`,
          ),
        ];
        if (els.length) {
          els[0].scrollIntoView({
            block: "center",
            behavior: window.__lenis ? "auto" : "smooth",
          });
          for (const el of els) {
            el.classList.remove(CLASS_FLASH);
            void el.offsetWidth; // reflow → restart the keyframe
            el.classList.add(CLASS_FLASH);
            window.setTimeout(() => el.classList.remove(CLASS_FLASH), 900);
          }
        }
        return;
      }

      // applyEdits: live DOM swap for image/video AND re-apply of pending inline TEXT — no reload.
      // edits: Array<{ field, kind:"image"|"video"|"text", url?, posterUrl?, mp4Url?, webmUrl?, text? }>
      if (data.type === "applyEdits" && Array.isArray(data.edits)) {
        let didText = false;
        for (const ed of data.edits as Array<{
          field: string;
          kind: "image" | "video" | "text";
          url?: string;
          posterUrl?: string;
          mp4Url?: string;
          webmUrl?: string;
          text?: string;
        }>) {
          // ALL matches, not the first: one content field legitimately renders in several places
          // (businessContact.* appears in both the footer and the contactPage card on /vi; each
          // formConfig label appears twice). querySelector re-applied a pending edit to whichever
          // came first in document order and left the rest showing the saved value — a preview that
          // disagreed with itself, and with what a save+refresh would render.
          const els = document.querySelectorAll<HTMLElement>(`[data-edit-field="${CSS.escape(ed.field)}"]`);
          if (els.length === 0) continue;

          for (const el of els) {
            if (ed.kind === "image" && ed.url) {
              const img =
                el.tagName === "IMG" ? (el as HTMLImageElement) : el.querySelector<HTMLImageElement>("img");
              if (img) {
                img.removeAttribute("srcset");
                img.src = ed.url;
              } else if (isFlexibleMedia(el)) {
                // A flexible slot (data-edit-caps="image,video") currently rendering a <video>: a
                // swap TO an image cannot be done by tweaking attributes — the element is the wrong
                // tag. Replace it. See buildFlexibleMediaEl for why this is safe re: overlay-classes'
                // child-mutation rule.
                el.replaceWith(buildFlexibleMediaEl("image", ed, el));
              } else {
                el.style.backgroundImage = `url("${ed.url}")`;
              }
            } else if (ed.kind === "video") {
              const video = (
                el.tagName === "VIDEO" ? el : el.querySelector("video")
              ) as HTMLVideoElement | null;
              if (video) {
                if (ed.posterUrl) video.poster = ed.posterUrl;
                const src = video.querySelector("source");
                if (src && ed.mp4Url) {
                  src.setAttribute("src", ed.mp4Url);
                  video.load();
                }
              } else if (isFlexibleMedia(el)) {
                // A flexible slot currently rendering an <img>: swapping TO a video needs the element
                // replaced (an <img> can't gain <source> children and play).
                el.replaceWith(buildFlexibleMediaEl("video", ed, el));
              }
            } else if (ed.kind === "text") {
              // gate (b): restore an unsaved inline text edit to the canvas after a refresh/locale
              // remount (the iframe re-renders from the saved draft; pending lives only in the admin).
              // Mutate ONLY the span's inner text. Don't clobber a leaf currently being edited.
              if (typeof ed.text === "string" && editing?.el !== el) {
                el.textContent = ed.text;
                didText = true;
              }
            }
          }
        }
        if (didText) {
          // gate (c): re-applied text changed heights → refresh ScrollTrigger + reposition hotspots.
          nudgeReflow();
        }
      }
    };
    window.addEventListener("message", onMessage);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(nudgeRaf);
      cancelAnimationFrame(hoverRaf);
      if (attachTimer) window.clearInterval(attachTimer);
      if (lenis && typeof lenis.off === "function") lenis.off("scroll", onLenisScroll);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("scroll", onWinEvent);
      window.removeEventListener("resize", onWinEvent);
      window.removeEventListener("wheel", onWinEvent);
      window.removeEventListener("touchmove", onWinEvent);
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("mousemove", onDocMove);
      document.removeEventListener("mouseleave", onDocLeave);
      window.removeEventListener("message", onMessage);
      // The overlay's classes/attributes live on the PAGE's own nodes, not the layer, so they
      // outlive the layer's removal unless cleared here.
      setColorHover(null);
      delete document.body.dataset.sxMode;
      if (editing) {
        editing.cleanup();
        editing.el.contentEditable = "false";
        editing = null;
      }
      layer.remove();
      style.remove();
    };
  }, []);

  return null;
}
