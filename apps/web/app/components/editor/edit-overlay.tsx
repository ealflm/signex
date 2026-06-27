"use client";

// app/components/editor/edit-overlay.tsx
// Visual-editor overlay — rendered ONLY inside the /preview editor route (never on public pages).
// On mount it scans the DOM for [data-edit-field] zones (stamped by editAttrs()/editText() in the
// shared section components when editable=1) and wires two kinds of inline editing:
//   • MEDIA ([data-edit-kind=image|video]) — a floating "hotspot" layer is the hover + click surface
//     for the media (it may be covered by content, so it lives above the page; click → admin drawer).
//   • TEXT  ([data-edit-kind=text])        — the span itself becomes contentEditable IN PLACE; the
//     committed value is postMessage'd back to the admin (no hotspot for text — Plan-4 gate (a)).
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
//   preview → admin:  { source, type: "edit", field, mediaKind: "image"|"video" }      // open media drawer
//                     { source, type: "textEdit", field, value }                       // committed inline text edit
//                     { source, type: "highlight", field }                             // canvas leaf focused (→ flash panel field)
//                     { source, type: "ready" }                                        // handshake on mount — admin re-applies pending edits
//   admin   → preview: { source, type: "refresh" }                                     // reload to show the just-saved working state
//                     { source, type: "highlight", field }                             // panel field focused (→ flash canvas leaf; Task 7)
//                     { source, type: "applyEdits", edits:[…] }                         // live DOM swap (no reload)
//     applyEdits edit shapes:
//       { field, kind:"image", url? } | { field, kind:"video", posterUrl?, mp4Url?, webmUrl? }
//       { field, kind:"text",  text }   // re-apply unsaved pending inline text after a refresh/remount
//
// SECURITY: we postMessage with targetOrigin "*" for simplicity in this internal tool (the admin
// VERIFIES event.origin on receipt). The inbound listener does NOT restrict origin so dev across
// localhost ports keeps working; only the literal { source:"signex-editor", … } shapes are honoured.
// PROD follow-up: pin targetOrigin to the admin origin and verify event.origin here too.

import { useEffect } from "react";

const SOURCE = "signex-editor";

// The two known locales (kept literal — i18n-config is a server module; the overlay is a tiny
// dependency-free client). Used to strip a leading /<locale> off intercepted hrefs.
const LOCALES = ["en", "vi"] as const;

type MediaEntry = { el: HTMLElement; hot: HTMLDivElement; onScreen: boolean };

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

      /* Inline TEXT editing. The affordance must NOT reflow the byte-faithful layout, so we use
         outline/box-shadow (paints outside the box) — never border/margin/padding. */
      [data-edit-kind="text"] { cursor: text; }
      [data-edit-kind="text"]:hover { outline: 2px solid #4956e3; outline-offset: 2px; }
      [data-edit-kind="text"][contenteditable="true"] {
        outline: 2px solid #4956e3; outline-offset: 2px; background: rgba(73,86,227,.06);
      }
      .sx-flash { animation: sx-flash .9s ease; }
      @keyframes sx-flash {
        0%,100% { outline-color: transparent; }
        25% { outline: 2px solid #4956e3; outline-offset: 2px; }
      }
    `;
    document.head.appendChild(style);

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

    // ---- media zones only (data-edit-kind="image"|"video"). TEXT zones get NO hotspot — Plan-4
    // gate (a): the scan selector excludes [data-edit-kind="text"], so a text leaf never gets an
    // "Edit image" badge (text is edited in place by the contentEditable path above).
    const fields = Array.from(
      document.querySelectorAll<HTMLElement>('[data-edit-kind="image"],[data-edit-kind="video"]'),
    );

    for (const el of fields) {
      const field = el.getAttribute("data-edit-field") ?? "";
      const mediaKind = (el.getAttribute("data-edit-kind") as "image" | "video") ?? "image";

      const hot = document.createElement("div");
      hot.className = "sx-edit-hotspot";
      hot.style.display = "none"; // shown by sync() once its element has a visible rect

      const badge = document.createElement("span");
      badge.className = "sx-edit-badge";
      badge.textContent = `Edit ${mediaKind} · ${field}`;
      hot.appendChild(badge);

      const onClick = (e: MouseEvent) => {
        // The hotspot sits above ALL page content, so a full-bleed media (e.g. the hero image, which
        // sits UNDER the headline + nav) can cover real controls AND in-place text leaves. Before
        // claiming the click for media editing, peek at what's underneath: temporarily hide the whole
        // hotspot layer, hit-test the page, restore.
        layer.style.display = "none";
        const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        layer.style.display = "";

        // 1) A TEXT leaf painted over the media (e.g. the hero title over the hero image) → edit the
        //    text in place, not the image.
        const underText = under?.closest?.('[data-edit-kind="text"]') as HTMLElement | null;
        if (underText) {
          e.preventDefault();
          e.stopPropagation();
          beginEdit(underText, e.clientX, e.clientY);
          return;
        }

        // 2) A navigation LINK genuinely painted OVER the media → re-dispatch so the user can
        //    navigate (the document interceptor rewrites internal links to /preview). Deliberately
        //    NOT buttons/inputs: the hero quote-form submit sits under the hero hotspot, and
        //    re-dispatching to it would POST a junk lead — clicking there edits the image.
        const control = under?.closest?.("a[href]") as HTMLElement | null;
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

        // 3) Otherwise: edit the media.
        e.preventDefault();
        e.stopPropagation();
        window.parent.postMessage({ source: SOURCE, type: "edit", field, mediaKind }, "*");
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

    // ---- internal navigation interception + inline-text click → enter edit -----------------------
    // The shared section components render PUBLIC hrefs (`/`, `/about`, `/contact`, …). Following them
    // would navigate the iframe OUT of /preview (no token/editable flag, no [data-edit-field]). We
    // intercept same-origin link clicks and redirect to the /preview equivalent. We ALSO claim clicks
    // on inline-text leaves here (capture phase) so they enter edit mode before the anchor/Webflow
    // runtime can act on them.
    const onDocClick = (e: MouseEvent) => {
      // Inline TEXT: a click on a [data-edit-kind="text"] span enters edit mode in place. Many text
      // leaves live inside an <a> (nav/footer labels, the features CTA) — preventDefault/stopProp so
      // clicking to edit never navigates. (Media hotspots cover media, not text, so text clicks reach
      // this capture-phase handler; the hero title covered by the hero image is handled in the hotspot
      // onClick passthrough above.)
      const textLeaf = (e.target as Element | null)?.closest?.('[data-edit-kind="text"]') as
        | HTMLElement
        | null;
      if (textLeaf) {
        e.preventDefault();
        e.stopPropagation();
        if (editing && editing.el === textLeaf) return; // already editing — let the caret move
        beginEdit(textLeaf, e.clientX, e.clientY);
        return;
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
          const el = document.querySelector<HTMLElement>(`[data-edit-field="${CSS.escape(ed.field)}"]`);
          if (!el) continue;

          if (ed.kind === "image" && ed.url) {
            const img =
              el.tagName === "IMG" ? (el as HTMLImageElement) : el.querySelector<HTMLImageElement>("img");
            if (img) {
              img.removeAttribute("srcset");
              img.src = ed.url;
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
      if (attachTimer) window.clearInterval(attachTimer);
      if (lenis && typeof lenis.off === "function") lenis.off("scroll", onLenisScroll);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("scroll", onWinEvent);
      window.removeEventListener("resize", onWinEvent);
      window.removeEventListener("wheel", onWinEvent);
      window.removeEventListener("touchmove", onWinEvent);
      document.removeEventListener("click", onDocClick, true);
      window.removeEventListener("message", onMessage);
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
