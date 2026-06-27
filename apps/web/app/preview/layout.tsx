// app/preview/layout.tsx
// EDITOR PREVIEW layout — a SEPARATE route tree from the public app/[lang]/** pages (which stay
// cached/SSG + untouched). It renders the SAME shared section components (Navbar/Footer/Hero/…)
// against the LIVE WORKING snapshot so the admin /visual editor can iframe it and click media to
// edit. It is NEVER cached (each page reads request-time data — token + a no-store snapshot fetch —
// which makes it dynamic under cacheComponents; see the per-page connection() call).
//
// This <head>/<body> MIRRORS the public app/[lang]/layout.tsx so the editor renders IDENTICALLY to
// the live site — same FOUC guard, same w-mod shim, same CSS, and crucially the SAME Webflow IX2
// runtime + page attrs. The runtime is what sizes the hero (.master_hero height), positions the
// `is-parallax` cover images, and fires the reveal interactions; without it the hero collapses to
// 0×0 and parallax media never positions (the "lệch/chưa chuẩn" bug). The runtime keys all of this
// off data-wf-page, which WebflowPageAttrs derives from the pathname via profileForRoute — and
// routeFromPathname() now strips the /preview prefix so /preview/<lang>/… resolves to the SAME
// profile as the matching public route.
//
// Intentional differences vs the public layout (this is an internal editing surface, not the site):
//   • No <PreviewBar>/draftMode, no GoogleAnalytics, no OrgJsonLd, no SSG metadata.
//   • The page (app/preview/[lang]/page.tsx) supplies its OWN page-wrapper / Navbar / Footer with
//     editable=1 + the <EditOverlay>, so this layout's <body> is just {children}.
//   • The CSP frame-ancestors header (so the admin can iframe this) is set in next.config.ts,
//     scoped to /preview/:path* only — public routes keep their default framing policy.
// This layout sits ABOVE the [lang] segment, so it has no lang param; <html lang> is the default
// (vi). IX2/profile resolution is pathname-driven client-side, so the bare lang attr is cosmetic.
import "../globals.css";
import { siteAttrs } from "@/app/lib/webflow-bundles";

// Verbatim from the public layout / legacy <head>: the FOUC guard hides animated elements until the
// IX2 runtime adds w-mod-ix3 (the runtime below adds it on init, just like the live site); the shim
// sets w-mod-js/w-mod-touch early so the w-mod-js-gated CSS (incl. the hero layout) applies pre-JS.
const WF_GUARD_STYLE =
  "html.w-mod-js:not(.w-mod-ix3) :is([marquee-up],[marquee-down],[stagger-text],.master_sales-cta){visibility:hidden !important;}";
const WF_MOD_SHIM =
  '!function(o,c){var n=c.documentElement,t=" w-mod-";n.className+=t+"js",("ontouchstart"in o||o.DocumentTouch&&c instanceof DocumentTouch)&&(n.className+=t+"touch")}(window,document);';

// Force reveal elements to their FINAL (visible) state. The IX2 runtime below still drives the hero
// height, the `is-parallax` cover positioning, and Lenis — all of which are layout (size / position /
// transform). But IX2's scroll/page-load REVEAL choreography (opacity:0 + blur(5px) → 1 / 0) does not
// fire reliably inside this route: the preview page is dynamic (connection() + Suspense streaming), so
// the page-load reveal trigger runs before the streamed hero is settled and never re-fires, leaving
// above-the-fold text stuck hidden. An editor must show content to edit it anyway, so we neutralize
// ONLY the hidden reveal state — opacity + filter — and deliberately touch NOTHING that the runtime
// owns (no width/height, no position, no transform), so parallax + the absolute cover image are
// unaffected. (This mirrors the live site's settled state; the entrance animation is simply skipped.)
const PREVIEW_REVEAL_STYLE = `
  [data-w-id], [style*="blur(5px)"] { opacity: 1 !important; filter: none !important; }
  .home-a_rest-content > * { opacity: 1 !important; filter: none !important; }
  html { visibility: visible !important; }
`;

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  const { domain, site } = siteAttrs(); // single source for the Webflow site attrs (matches public)
  return (
    // suppressHydrationWarning: WF_MOD_SHIM adds w-mod-js/w-mod-touch and WebflowPageAttrs sets
    // data-wf-page on <html> before hydration — both intentionally diverge from SSR (same as public).
    <html lang="vi" suppressHydrationWarning data-wf-domain={domain} data-wf-site={site}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: WF_GUARD_STYLE }} />
        <style dangerouslySetInnerHTML={{ __html: PREVIEW_REVEAL_STYLE }} />
        <script dangerouslySetInnerHTML={{ __html: WF_MOD_SHIM }} />
        <link rel="stylesheet" href="/assets/css/caladan-template.shared.28e174924.css" />
        <link rel="stylesheet" href="/assets/css/lenis.css" />
        <link rel="stylesheet" href="/assets/fonts/ibm-plex-mono.css" />
      </head>
      <body>
        {children}
        {/* The Webflow runtime (WebflowPageAttrs + WebflowRuntime) is NOT mounted here. It boots from
            inside each preview page's own dynamic <Suspense> subtree via <PreviewRuntime/> (next to
            <EditOverlay/>), so its DOM-mutating boot runs only AFTER React has hydrated the streamed
            navbar — otherwise Webflow's w-nav widget mutates the not-yet-hydrated navbar and triggers
            a structural hydration mismatch (#418) that regenerates the whole page subtree and wipes
            in-progress inline edits. See app/preview/preview-runtime.tsx for the full rationale. */}
      </body>
    </html>
  );
}
