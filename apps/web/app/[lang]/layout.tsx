import type { Metadata, Viewport } from "next";
import "../globals.css";
import { Navbar } from "@/app/components/navbar";
import { Footer } from "@/app/components/footer";
import { WebflowRuntime } from "@/app/components/webflow-runtime";
import { WebflowPageAttrs } from "@/app/components/webflow-page-attrs";
import { LOCALES, hasLocale, DEFAULT_LOCALE } from "@/app/lib/i18n-config";
import { getSiteContent } from "@/app/lib/content";
import { PreviewBar } from "@/app/components/preview-bar";
import { buildMetadata, THEME_COLOR } from "@/app/lib/seo";
import { siteAttrs } from "@/app/lib/webflow-bundles";
import { OrgJsonLd } from "@/app/components/org-json-ld";
import { GoogleAnalytics } from "@next/third-parties/google";

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
  // Configurable GA4: the measurement id comes from the SAME cached snapshot loader (no extra
  // read, stays SSG/'use cache'). ONLY inject Google Analytics when an id is actually set —
  // empty string ⇒ render nothing (no gtag.js, no network). Id is edited in admin (meta block).
  // NOTE (follow-up for production/GDPR): gate tracking behind cookie-consent. GA4 uses
  // Consent Mode v2 — `gtag('consent','default',{analytics_storage:'denied'})` before the
  // config call, then update on opt-in — NOT the legacy UA `anonymize_ip`. Out of scope here.
  const ga4Id = dict.meta.ga4Id;
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
        {/* Google Analytics is injected ONLY when a GA4 id is configured (admin → meta block). */}
        {ga4Id ? <GoogleAnalytics gaId={ga4Id} /> : null}
        <PreviewBar />
        <WebflowPageAttrs />
        <WebflowRuntime />
      </body>
    </html>
  );
}
