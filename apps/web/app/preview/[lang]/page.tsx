// app/preview/[lang]/page.tsx — EDITOR PREVIEW of the HOME page (live working snapshot).
//
// Token gate: the admin iframes this with ?secret=<PREVIEW_SECRET>. If it doesn't match the
// server-side PREVIEW_SECRET we render notFound() — we NEVER expose working (unpublished) state
// without the token. (PROD follow-up: swap the raw secret for a short-lived signed token; the raw
// secret in an internal-tool iframe URL is acceptable here. The web origin also restricts framing
// to the admin origin via the CSP frame-ancestors header set in next.config.ts.)
//
// Dynamic / cacheComponents: this route is NEVER cached/SSG. Under cacheComponents ALL request-time
// + uncached data access (connection(), searchParams, the no-store getPreviewSnapshot() fetch) MUST
// live inside <Suspense> — the page shell prerenders statically and the dynamic content streams in.
// So the page component renders ONLY the <Suspense> boundary; ALL request work happens in the
// child <PreviewHome>. (The old `export const dynamic='force-dynamic'` is removed under cacheComponents.)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { hasLocale, DEFAULT_LOCALE } from "@/app/lib/i18n-config";
import { getPreviewSnapshot } from "@/app/lib/content";
import { Navbar } from "@/app/components/navbar";
import { Footer } from "@/app/components/footer";
import { Hero } from "@/app/components/home/hero";
import { Features } from "@/app/components/home/features";
import { ProductCategories } from "@/app/components/home/product-categories";
import { HomeAbout } from "@/app/components/home/home-about";
import { Contact } from "@/app/components/home/contact";
import { EditOverlay } from "@/app/components/editor/edit-overlay";

async function PreviewHome({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ secret?: string }>;
}) {
  await connection(); // request-time only — never prerender this subtree
  const { secret } = await searchParams;
  if (!process.env.PREVIEW_SECRET || secret !== process.env.PREVIEW_SECRET) notFound();

  const { lang } = await params;
  const locale = hasLocale(lang) ? lang : DEFAULT_LOCALE;
  const dict = await getPreviewSnapshot(locale);

  return (
    <div className="page-wrapper">
      <Navbar dict={dict.nav} editable />
      <main id="main" className="main-wrapper">
        <Hero dict={dict} editable />
        <div className="home-a_rest-content">
          <Features dict={dict.features} editable />
          <ProductCategories dict={dict.products} />
          <HomeAbout dict={dict.about} />
          <Contact dict={dict} />
        </div>
        <Footer dict={dict.footer} editable />
      </main>
      <EditOverlay />
    </div>
  );
}

export default function PreviewHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ secret?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <PreviewHome params={params} searchParams={searchParams} />
    </Suspense>
  );
}
