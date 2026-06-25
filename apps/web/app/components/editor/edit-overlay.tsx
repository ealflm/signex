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
      if (host !== el) host.style.position ||= "relative";
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
      window.removeEventListener("message", onMessage);
      style.remove();
    };
  }, []);

  return null;
}
