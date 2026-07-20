// app/preview/[lang]/about/page.tsx — EDITOR PREVIEW of the /about page (live working snapshot).
// Reuses the SAME <AboutSections> body as the public route (single source — no fork), with
// editable=1 so its media zones (aboutPage.hero.video, aboutPage.testimonial.image) are clickable.
// Token-gated + force-dynamic identically to the home preview page (see its header for the rationale):
// the page renders ONLY the <Suspense> boundary; ALL request-time work (connection(), searchParams,
// the uncached snapshot read) happens in the child, as cacheComponents requires.
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { hasLocale, DEFAULT_LOCALE } from "@/app/lib/i18n-config";
import { getPreviewSnapshot } from "@/app/lib/content";
import { Navbar } from "@/app/components/navbar";
import { Footer } from "@/app/components/footer";
import { AboutSections } from "@/app/components/about/about-sections";
import { EditOverlay } from "@/app/components/editor/edit-overlay";
import { PaletteStyle } from "@/app/components/editor/palette-style";
import { PreviewRuntime } from "@/app/preview/preview-runtime";
import { FloatingContact } from "@/app/components/floating-contact";

async function PreviewAbout({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ secret?: string; theme?: string }>;
}) {
  await connection();
  const { secret, theme } = await searchParams;
  if (!process.env.PREVIEW_SECRET || secret !== process.env.PREVIEW_SECRET) notFound();

  const { lang } = await params;
  const locale = hasLocale(lang) ? lang : DEFAULT_LOCALE;
  const dict = await getPreviewSnapshot(locale, theme);

  return (
    <div className="page-wrapper">
      <PaletteStyle palette={dict.palette} />
      <Navbar dict={dict.nav} editable />
      <main id="main" className="main-wrapper">
        <AboutSections dict={dict} editable />
        <Footer dict={dict.footer} editable />
        <FloatingContact dict={dict} />
      </main>
      <EditOverlay />
      {/* Webflow boot in this dynamic subtree (not the layout) — see preview-runtime.tsx (#418 fix). */}
      <PreviewRuntime />
    </div>
  );
}

export default function PreviewAboutPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ secret?: string; theme?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <PreviewAbout params={params} searchParams={searchParams} />
    </Suspense>
  );
}
