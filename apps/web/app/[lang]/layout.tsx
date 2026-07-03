import type { Metadata, Viewport } from "next";
import "../globals.css";
import { Navbar } from "@/app/components/navbar";
import { Footer } from "@/app/components/footer";
import { WebflowRuntime } from "@/app/components/webflow-runtime";
import { WebflowPageAttrs } from "@/app/components/webflow-page-attrs";
import { LOCALES, hasLocale, DEFAULT_LOCALE } from "@/app/lib/i18n-config";
import { getSiteContent } from "@/app/lib/content";
import { getGa4Id } from "@/app/lib/site-config";
import { PreviewBar } from "@/app/components/preview-bar";
import { buildMetadata, THEME_COLOR } from "@/app/lib/seo";
import { siteAttrs } from "@/app/lib/webflow-bundles";
import { OrgJsonLd } from "@/app/components/org-json-ld";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@/app/components/analytics";

// Verbatim from legacy/caladan/index.html <head>: the FOUC guard hides animated
// elements until the IX2 runtime adds w-mod-ix3; the shim sets w-mod-js/w-mod-touch early.
const WF_GUARD_STYLE =
  "html.w-mod-js:not(.w-mod-ix3) :is([marquee-up],[marquee-down],[stagger-text],.master_sales-cta){visibility:hidden !important;}";
const WF_MOD_SHIM =
  '!function(o,c){var n=c.documentElement,t=" w-mod-";n.className+=t+"js",("ontouchstart"in o||o.DocumentTouch&&c instanceof DocumentTouch)&&(n.className+=t+"touch")}(window,document);';

// Localized site metadata (EN/VI). This is the base for every route; pages like /about and
// /contact override it with their own generateMetadata. Home (which has no page-level metadata)
// uses this directly. See app/lib/seo.ts for why metadata is built whole (shallow merge).
// Browser UI theme color (address bar) — brand deep-navy. Width/scale repeat Next's defaults
// so exporting `viewport` doesn't drop them.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: THEME_COLOR,
};

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const locale = hasLocale(lang) ? lang : DEFAULT_LOCALE;
  const dict = await getSiteContent(locale);
  return buildMetadata({ locale, meta: dict.meta, title: dict.meta.title, description: dict.meta.description });
}

// Pre-render one route per locale. (Under cacheComponents the `dynamicParams`
// route config is not allowed; unknown-locale rejection is handled in-render.)
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  // generateStaticParams pre-lists all locales; the hasLocale guard narrows the unknown
  // string to Locale for getSiteContent (unknown locales fall back to DEFAULT_LOCALE in-render).
  const dict = await getSiteContent(hasLocale(lang) ? lang : DEFAULT_LOCALE);
  const { domain, site } = siteAttrs(); // single source for the Webflow site attrs
  // Configurable GA4: the measurement id comes from the global SiteConfig singleton (admin
  // Settings page), read via getGa4Id() — a separate 'use cache' + cacheTag('release') loader so
  // analytics is INDEPENDENT of the published theme (a theme publish OR a site-config PATCH both
  // refresh it). ONLY inject Google Analytics when an id is actually set — empty string ⇒ render
  // nothing (no gtag.js, no network).
  // NOTE (follow-up for production/GDPR): gate tracking behind cookie-consent. GA4 uses
  // Consent Mode v2 — `gtag('consent','default',{analytics_storage:'denied'})` before the
  // config call, then update on opt-in — NOT the legacy UA `anonymize_ip`. Out of scope here.
  const ga4Id = await getGa4Id();
  // Optional GA4 DebugView: set GA_DEBUG=1 (server env) to flag hits as debug so
  // they surface in GA4 → Admin → DebugView while testing. OFF in production so
  // real traffic is never marked debug (and excluded from standard reports).
  const gaDebug = process.env.GA_DEBUG === "1";
  return (
    // suppressHydrationWarning: the WF_MOD_SHIM script adds w-mod-js/w-mod-touch to <html> before
    // hydration, and WebflowPageAttrs sets data-wf-page on it — both intentionally diverge from SSR.
    <html
      lang={lang}
      suppressHydrationWarning
      // Real brand domain (NOT *.webflow.io) so the Webflow "brand" module never injects the
      // "Made in Webflow" badge — it only force-shows it when data-wf-domain ends in .webflow.io.
      // Keep this in sync with siteAttrs() in app/lib/webflow-bundles.ts (set client-side too).
      data-wf-domain={domain}
      data-wf-site={site}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: WF_GUARD_STYLE }} />
        <script dangerouslySetInnerHTML={{ __html: WF_MOD_SHIM }} />
        <link rel="stylesheet" href="/assets/css/caladan-template.shared.28e174924.css" />
        <link rel="stylesheet" href="/assets/css/lenis.css" />
        {/* IBM Plex Mono: ibm-plex-mono.css is a plain @font-face stylesheet (the export loads
            it via WebFont.load, but webfont.js isn't available in <head>), so link it directly. */}
        <link rel="stylesheet" href="/assets/fonts/ibm-plex-mono.css" />
      </head>
      <body>
        {/* Skip link — first focusable element, lets keyboard/AT users jump past the navbar. */}
        <a href="#main" className="skip-link">{dict.nav.skip}</a>
        <div className="page-wrapper">
          <Navbar dict={dict.nav} />
          <main id="main" className="main-wrapper">
            {children}
            <Footer dict={dict.footer} />
          </main>
        </div>
        <OrgJsonLd dict={dict} />
        {/* Google Analytics is injected ONLY when a GA4 id is configured (admin → Settings). */}
        {ga4Id ? <GoogleAnalytics gaId={ga4Id} debugMode={gaDebug} /> : null}
        {/* First-party analytics — parallel to GA4; reads its own /api/collect. */}
        <Analytics />
        <PreviewBar />
        <WebflowPageAttrs />
        <WebflowRuntime />
      </body>
    </html>
  );
}
