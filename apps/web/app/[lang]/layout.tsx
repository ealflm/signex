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
import { GoogleTagManager } from "@next/third-parties/google";
import { Analytics } from "@/app/components/analytics";

// Verbatim from legacy/caladan/index.html <head>: the FOUC guard hides animated
// elements until the IX2 runtime adds w-mod-ix3; the shim sets w-mod-js/w-mod-touch early.
const WF_GUARD_STYLE =
  "html.w-mod-js:not(.w-mod-ix3) :is([marquee-up],[marquee-down],[stagger-text],.master_sales-cta){visibility:hidden !important;}";
const WF_MOD_SHIM =
  '!function(o,c){var n=c.documentElement,t=" w-mod-";n.className+=t+"js",("ontouchstart"in o||o.DocumentTouch&&c instanceof DocumentTouch)&&(n.className+=t+"touch")}(window,document);';

// Google Tag Manager container — the SINGLE source for all marketing/analytics tags.
// GA4 (G-HTGYKH7Y2T) and the "Lượt yêu cầu thông tin báo giá" Google Ads conversion
// (AW-18302102784/…) are configured INSIDE the GTM UI (under core@signex.vn), NOT in code;
// the site only emits a `quote_submit` dataLayer event (see app/lib/analytics/gtm-events.ts).
// Production-only so local/dev and the CMS editor (/preview) never load real tags; empty
// id ⇒ nothing is injected. See docs/superpowers/specs/2026-07-06-gtm-tag-management-migration-design.md.
const GTM_CONTAINER_ID = process.env.NODE_ENV === "production" ? "GTM-TMHSNCN9" : "";

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
  // Marketing/analytics tags are managed in GTM now (container GTM_CONTAINER_ID above); GA4 and
  // the Google Ads quote-request conversion are configured inside the GTM UI, not here.
  // NOTE (follow-up for production/GDPR): gate tracking behind cookie-consent — GTM supports
  // Consent Mode v2 (set consent defaults to 'denied', update on opt-in). Out of scope here.
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
        {/* GTM container — single source for GA4 + Google Ads conversion + future pixels.
            Public site, production only (empty id ⇒ nothing loads). */}
        {GTM_CONTAINER_ID ? <GoogleTagManager gtmId={GTM_CONTAINER_ID} /> : null}
        {/* First-party analytics — parallel to GA4; reads its own /api/collect. */}
        <Analytics />
        <PreviewBar />
        <WebflowPageAttrs />
        <WebflowRuntime />
      </body>
    </html>
  );
}
