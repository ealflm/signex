// app/preview/preview-runtime.tsx
// Webflow boot for the EDITOR PREVIEW routes — deliberately mounted INSIDE each preview page's
// dynamic <Suspense> subtree (next to <EditOverlay/>), NOT in the shared preview layout shell.
//
// WHY (load-bearing — fixes the editable-preview React #418 + inline-edit loss):
//   The preview routes are dynamic (connection() + a no-store snapshot fetch) and STREAM their
//   content (Navbar…Footer) into a <Suspense fallback={null}> hole. If the Webflow runtime boots
//   from the layout shell (a SEPARATE, fast-resolving Suspense that only awaits usePathname), it
//   loads the Webflow core chunk and that chunk's Webflow.ready() initialises the `w-nav` widget —
//   appending a `w-nav-overlay` child div + aria-* attrs to the navbar — BEFORE React has hydrated
//   the still-streaming navbar. React then sees client DOM ≠ server HTML → a structural hydration
//   mismatch (#418) and REGENERATES the entire PreviewHome Suspense subtree (Hero + EditOverlay),
//   which wipes any in-progress inline text edit and scroll-jumps the canvas.
//   Mounting the runtime here, inside the SAME boundary as the navbar, guarantees its effect (the
//   script load) runs only AFTER that boundary has hydrated — so Webflow mutates a navbar React
//   already owns (a post-hydration mutation, which React ignores). The public route is unaffected:
//   it stays static/SSG, hydrates immediately, and keeps the runtime in its own layout.
"use client";

import { WebflowPageAttrs } from "@/app/components/webflow-page-attrs";
import { WebflowRuntime } from "@/app/components/webflow-runtime";

export function PreviewRuntime() {
  return (
    <>
      <WebflowPageAttrs />
      <WebflowRuntime />
    </>
  );
}
