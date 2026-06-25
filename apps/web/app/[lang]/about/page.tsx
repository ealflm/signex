// /about — faithful port of signex-web-ref's /homepage/home-c (the Caladan "home-c"
// layout). Content is the original Caladan placeholder copy, to be localised section by
// section later. Lives under [lang] so it inherits the EN/VI locale routing; the body is
// static for now (no dict use yet) but keeps the same params/hasLocale guard as the home
// page so the route is locale-validated. NOTE: /about is mapped to the HOME webflow bundle
// in app/lib/webflow-bundles.ts because that bundle carries this layout's IX2 reveal
// interactions (the elements below start at opacity:0 / blur and are revealed on scroll).
//
// The page BODY lives in app/components/about/about-sections.tsx so the /preview editor route
// can reuse the exact same markup (single source — no fork). This file stays the cached/SSG
// public entry: it owns the locale guard + metadata and renders <AboutSections> with the
// published dict (editable defaults to false → no editor attributes in the static HTML).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, DEFAULT_LOCALE } from "@/app/lib/i18n-config";
import { getSiteContent } from "@/app/lib/content";
import { buildMetadata } from "@/app/lib/seo";
import { AboutSections } from "@/app/components/about/about-sections";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const locale = hasLocale(lang) ? lang : DEFAULT_LOCALE;
  const m = (await getSiteContent(locale)).meta;
  return buildMetadata({ locale, meta: m, title: `${m.about.title} | ${m.siteName}`, description: m.about.description, path: "/about" });
}

export default async function AboutPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound(); // narrows lang to Locale; rejects unknown locales with a 404
  const dict = await getSiteContent(lang); // localised copy for the sections being customised (EN + VI)
  return <AboutSections dict={dict} />;
}
