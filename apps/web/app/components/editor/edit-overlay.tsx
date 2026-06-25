"use client";

// app/components/editor/edit-overlay.tsx
// Visual-editor overlay — rendered ONLY inside the /preview editor route (never on public pages).
// On mount it scans the DOM for [data-edit-field] media zones (stamped by editAttrs() in the shared
// section components when editable=1), draws a hover outline + a small "Edit" affordance, and on
// click postMessages the parent admin window so it can open the edit drawer for that field. It also
// listens for a "refresh" message from the parent (sent after a successful save) and reloads the
// iframe so the new working-state media renders. Small + dependency-free by design.
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
      [data-edit-field] { position: relative; cursor: pointer; }
      [data-edit-field].sx-edit-hover { outline: 2px solid #4956e3; outline-offset: -2px; }
      .sx-edit-badge {
        position: absolute; top: 8px; left: 8px; z-index: 2147483646;
        display: inline-flex; align-items: center; gap: 4px;
        padding: 4px 8px; border-radius: 6px;
        background: #4956e3; color: #fff;
        font: 600 12px/1 ui-sans-serif, system-ui, sans-serif;
        box-shadow: 0 1px 4px rgba(0,0,0,.3); pointer-events: none;
        opacity: 0; transition: opacity .12s ease;
      }
      [data-edit-field].sx-edit-hover > .sx-edit-badge,
      [data-edit-field].sx-edit-hover .sx-edit-badge { opacity: 1; }
    `;
    document.head.appendChild(style);

    const fields = Array.from(
      document.querySelectorAll<HTMLElement>("[data-edit-field]"),
    );

    // Track a badge per field element (a sibling overlay so we never mutate media markup state).
    const cleanups: Array<() => void> = [];

    for (const el of fields) {
      const field = el.getAttribute("data-edit-field") ?? "";
      const mediaKind = (el.getAttribute("data-edit-kind") as "image" | "video") ?? "image";

      // The badge label communicates what will be edited.
      const badge = document.createElement("span");
      badge.className = "sx-edit-badge";
      badge.textContent = `Edit ${mediaKind} · ${field}`;

      // <img> can't hold child nodes — anchor the badge on the nearest positioned ancestor so it
      // floats over the image. For block elements we can append directly.
      const host =
        el.tagName === "IMG" || el.tagName === "VIDEO"
          ? (el.parentElement ?? el)
          : el;
      // Anchor the absolutely-positioned badge on `host`. Only promote a STATICALLY-positioned host
      // to relative — NEVER clobber an existing non-static position. The Webflow `position:absolute`
      // on elements like .image_hero-home-a comes from a CSS class (so el.style.position is ""/falsy);
      // the old `||= "relative"` therefore overwrote it, dropping the full-bleed cover image back into
      // flow and collapsing the hero to half width. absolute/relative/fixed/sticky already establish a
      // containing block for the badge, so leaving them be both fixes the layout AND anchors correctly.
      if (host !== el && getComputedStyle(host).position === "static") {
        host.style.position = "relative";
      }
      host.appendChild(badge);

      const onEnter = () => el.classList.add("sx-edit-hover");
      const onLeave = () => el.classList.remove("sx-edit-hover");
      const onClick = (e: MouseEvent) => {
        // Suppress the underlying link/navigation/video controls so editing wins.
        e.preventDefault();
        e.stopPropagation();
        window.parent.postMessage(
          { source: SOURCE, type: "edit", field, mediaKind },
          "*",
        );
      };

      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
      // Capture phase so we intercept before the Webflow runtime / anchor handlers.
      el.addEventListener("click", onClick, true);

      cleanups.push(() => {
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mouseleave", onLeave);
        el.removeEventListener("click", onClick, true);
        badge.remove();
      });
    }

    // ---- internal navigation interception: keep edit mode across in-iframe page changes -------
    // The shared section components render PUBLIC hrefs (`/`, `/about`, `/contact`,
    // `/products/<slug>`, …). Following them would navigate the iframe OUT of /preview — the public
    // pages carry no token/editable flag and no [data-edit-field] annotations, so nothing would be
    // selectable. We intercept same-origin link clicks here and redirect the iframe to the /preview
    // equivalent, preserving the locale + secret + editable flag. The overlay re-mounts on the new
    // page → media zones re-annotate → selection works on the new page.
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
      cleanups.forEach((fn) => fn());
      document.removeEventListener("click", onDocClick, true);
      window.removeEventListener("message", onMessage);
      style.remove();
    };
  }, []);

  return null;
}
