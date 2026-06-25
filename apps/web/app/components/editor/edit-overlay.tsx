"use client";

// app/components/editor/edit-overlay.tsx
// Visual-editor overlay — rendered ONLY inside the /preview editor route (never on public pages).
// On mount it scans the DOM for [data-edit-field] media zones (stamped by editAttrs() in the shared
// section components when editable=1) and, for each, draws a floating "hotspot" that is the hover +
// click surface for editing that media. On click it postMessages the parent admin window so it can
// open the edit drawer for that field. It also listens for a "refresh" message from the parent (sent
// after a successful save) and reloads the iframe so the new working-state media renders.
//
// WHY A FLOATING HOTSPOT LAYER (not listeners + a badge ON the media element):
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
//   preview → admin:  { source, type: "edit", field: "<block>.<path>", mediaKind: "image"|"video" }
//   admin   → preview: { source, type: "refresh" }   // reload to show the just-saved working state
//
// SECURITY: we postMessage with targetOrigin "*" for simplicity in this internal tool (the admin
// VERIFIES event.origin on receipt). The inbound listener does NOT restrict origin so dev across
// localhost ports keeps working; only the literal { source:"signex-editor", type:"refresh" } shape
// is honoured (it just reloads — no data is trusted). PROD follow-up: pin targetOrigin to the admin
// origin and verify event.origin here too.

import { useEffect } from "react";

const SOURCE = "signex-editor";

// The two known locales (kept literal — i18n-config is a server module; the overlay is a tiny
// dependency-free client). Used to strip a leading /<locale> off intercepted hrefs.
const LOCALES = ["en", "vi"] as const;

export function EditOverlay() {
  useEffect(() => {
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
    `;
    document.head.appendChild(style);

    // ---- hotspot layer: a fixed, page-layout-neutral overlay that holds one hotspot per zone ----
    const layer = document.createElement("div");
    layer.className = "sx-edit-layer";
    document.body.appendChild(layer);

    const fields = Array.from(
      document.querySelectorAll<HTMLElement>("[data-edit-field]"),
    );

    const entries = fields.map((el) => {
      const field = el.getAttribute("data-edit-field") ?? "";
      const mediaKind = (el.getAttribute("data-edit-kind") as "image" | "video") ?? "image";

      const hot = document.createElement("div");
      hot.className = "sx-edit-hotspot";
      hot.style.display = "none"; // shown by the sync loop once its element has a visible rect

      const badge = document.createElement("span");
      badge.className = "sx-edit-badge";
      badge.textContent = `Edit ${mediaKind} · ${field}`;
      hot.appendChild(badge);

      const onClick = (e: MouseEvent) => {
        // The hotspot sits above ALL page content, so a full-bleed media (e.g. the hero image, whose
        // top edge runs UNDER the floating navbar) can end up covering real navigation links. Before
        // claiming the click for editing, peek at what's underneath: temporarily hide the whole
        // hotspot layer, hit-test the page, restore. If a navigation control (a link/button that is
        // NOT this media zone or its ancestor/descendant — i.e. genuinely painted OVER the media)
        // is there, re-dispatch the click to it so the user can navigate (the document interceptor
        // rewrites internal links to their /preview equivalent). Otherwise, edit the media.
        layer.style.display = "none";
        const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        layer.style.display = "";
        // Only LINKS pass through (navbar links + the "Nhận báo giá" CTA are <a href>). Deliberately
        // NOT buttons/inputs: the hero's quote-form submit button sits under the hero hotspot, and
        // re-dispatching to it would POST a junk lead from the editor — clicking there edits the image.
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
        e.preventDefault();
        e.stopPropagation();
        window.parent.postMessage(
          { source: SOURCE, type: "edit", field, mediaKind },
          "*",
        );
      };
      hot.addEventListener("click", onClick);
      layer.appendChild(hot);

      return { el, hot };
    });

    // ---- position sync: mirror each element's viewport rect onto its hotspot every frame ----------
    // A rAF loop (not scroll/resize listeners) is used deliberately: Lenis smooth-scroll moves content
    // via transforms (no native scroll events), and hero parallax / testimonial sliders also move the
    // media by transform. getBoundingClientRect reflects all of that, so the hotspot stays glued to the
    // media. Rects are clamped to the viewport so the badge stays on-screen and a tall parallax image
    // (taller than its clipped section) doesn't paint a hotspot outside the visible area.
    let raf = 0;
    const sync = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      for (const { el, hot } of entries) {
        const r = el.getBoundingClientRect();
        const left = Math.max(0, r.left);
        const top = Math.max(0, r.top);
        const right = Math.min(vw, r.right);
        const bottom = Math.min(vh, r.bottom);
        const w = right - left;
        const h = bottom - top;
        if (w <= 2 || h <= 2) {
          if (hot.style.display !== "none") hot.style.display = "none";
          continue;
        }
        hot.style.display = "block";
        hot.style.left = `${left}px`;
        hot.style.top = `${top}px`;
        hot.style.width = `${w}px`;
        hot.style.height = `${h}px`;
      }
      raf = requestAnimationFrame(sync);
    };
    raf = requestAnimationFrame(sync);

    // ---- internal navigation interception: keep edit mode across in-iframe page changes -------
    // The shared section components render PUBLIC hrefs (`/`, `/about`, `/contact`,
    // `/products/<slug>`, …). Following them would navigate the iframe OUT of /preview — the public
    // pages carry no token/editable flag and no [data-edit-field] annotations, so nothing would be
    // selectable. We intercept same-origin link clicks here and redirect the iframe to the /preview
    // equivalent, preserving the locale + secret + editable flag. The overlay re-mounts on the new
    // page → media zones re-annotate → selection works on the new page. (Hotspots cover media, not
    // nav links, so ordinary links still reach this handler.)
    const onDocClick = (e: MouseEvent) => {
      // Honour the media-zone editor clicks (handled above) and modified clicks (new-tab etc.).
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as
        | HTMLAnchorElement
        | null;
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

      // Normalize the target: drop the query/hash, then strip a leading /<locale> →
      // logicalPath ("" for home, "/about", "/contact", "/products/x", …).
      const path = raw.split(/[?#]/)[0];
      const segs = path.split("/"); // ["", "vi", "about"] or ["", "about"] or [""]
      if ((LOCALES as readonly string[]).includes(segs[1])) segs.splice(1, 1);
      const logicalPath = segs.join("/").replace(/^\/+/, "/").replace(/^\/$/, "");

      e.preventDefault();
      const qs = `?secret=${encodeURIComponent(secret)}&editable=1`;
      window.location.assign(`/preview/${lang}${logicalPath}${qs}`);
    };
    // Capture phase so we intercept before the Webflow runtime / anchor default navigation.
    document.addEventListener("click", onDocClick, true);

    // ---- inbound: parent → preview "refresh" → reload to render the saved working state ----
    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (data && typeof data === "object" && data.source === SOURCE && data.type === "refresh") {
        window.location.reload();
      }
    };
    window.addEventListener("message", onMessage);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("click", onDocClick, true);
      window.removeEventListener("message", onMessage);
      layer.remove();
      style.remove();
    };
  }, []);

  return null;
}
