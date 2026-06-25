// app/preview/layout.tsx
// EDITOR PREVIEW layout — a SEPARATE route tree from the public app/[lang]/** pages (which stay
// cached/SSG + untouched). It renders the SAME shared section components (Navbar/Footer/Hero/…)
// against the LIVE WORKING snapshot so the admin /visual editor can iframe it and click media to
// edit. It is NEVER cached (each page reads request-time data — token + a no-store snapshot fetch —
// which makes it dynamic under cacheComponents; see the per-page connection() call).
//
// Differences vs the public layout, all intentional for an editing surface:
//   • No <PreviewBar>/draftMode, no GA4, no OrgJsonLd, no SSG metadata — this is an internal tool.
//   • The Webflow IX2 JS runtime is NOT loaded here. The public pages start reveal elements at
//     opacity:0/blur(5px) and rely on IX2 (gated by data-wf-page) to reveal them; matching that
//     gating under the /preview path is fragile, so instead we force all reveal elements visible
//     with a scoped <style> below. The editor needs media VISIBLE + CLICKABLE, not scroll choreo.
//   • The CSP frame-ancestors header (so the admin can iframe this) is set in next.config.ts,
//     scoped to /preview/:path* only — public routes keep their default framing policy.
import "../globals.css";

// Force every IX2 reveal element visible (the public pages animate these in via the Webflow
// runtime, which we deliberately don't load here). Also neutralize the FOUC guard from the public
// <head> (not present here, but harmless) and let media zones receive hover/click cleanly.
const PREVIEW_REVEAL_STYLE = `
  [style*="blur(5px)"], [data-w-id] { opacity: 1 !important; filter: none !important; }
  .home-a_rest-content > * { opacity: 1 !important; filter: none !important; }
  html { visibility: visible !important; }
`;

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    // `w-mod-js` mirrors the class WF_MOD_SHIM stamps onto the public <html> — a large slice of the
    // Webflow CSS (incl. the hero .w-background-video + two-tone title layout) is gated behind it.
    // Without it the hero falls back to its no-JS state (image-only right half). It does NOT load the
    // IX2 runtime, so reveal choreography is still off — the PREVIEW_REVEAL_STYLE force-visible above
    // remains what makes reveal elements appear.
    <html lang="vi" className="w-mod-js" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: PREVIEW_REVEAL_STYLE }} />
        <link rel="stylesheet" href="/assets/css/caladan-template.shared.28e174924.css" />
        <link rel="stylesheet" href="/assets/css/lenis.css" />
        <link rel="stylesheet" href="/assets/fonts/ibm-plex-mono.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
