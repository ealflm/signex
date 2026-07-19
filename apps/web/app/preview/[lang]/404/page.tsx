// app/preview/[lang]/404/page.tsx — EDITOR PREVIEW of the 404 page (live working snapshot).
// Mirrors the public not-found.tsx layout but driven by the snapshot so the notFound block
// is inline-editable in preview. Note: the public 404 stays hard-coded (see Task 61b —
// not-found-view.tsx is 'use client' and cannot consume server-only SiteContent). This surface
// makes the block editable in preview and closes the notFound.image media-stamp gap.
// Token-gated + Suspense-wrapped identically to the other preview routes.
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { hasLocale, DEFAULT_LOCALE } from "@/app/lib/i18n-config";
import { getPreviewSnapshot } from "@/app/lib/content";
import { Navbar } from "@/app/components/navbar";
import { Footer } from "@/app/components/footer";
import { NotFoundPreview } from "@/app/components/not-found-preview";
import { EditOverlay } from "@/app/components/editor/edit-overlay";
import { PreviewRuntime } from "@/app/preview/preview-runtime";
import { FloatingContact } from "@/app/components/floating-contact";

async function Preview404({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ secret?: string; theme?: string }>;
}) {
  await connection(); // request-time only — never prerender this subtree
  const { secret, theme } = await searchParams;
  if (!process.env.PREVIEW_SECRET || secret !== process.env.PREVIEW_SECRET) notFound();

  const { lang } = await params;
  const locale = hasLocale(lang) ? lang : DEFAULT_LOCALE;
  const dict = await getPreviewSnapshot(locale, theme);

  return (
    <div className="page-wrapper">
      <Navbar dict={dict.nav} editable />
      <main id="main" className="main-wrapper">
        <NotFoundPreview dict={dict} locale={locale} editable />
        <Footer dict={dict.footer} editable />
        <FloatingContact dict={dict} />
      </main>
      <EditOverlay />
      {/* Webflow boot in this dynamic subtree (not the layout) — see preview-runtime.tsx (#418 fix). */}
      <PreviewRuntime />
    </div>
  );
}

export default function Preview404Page({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ secret?: string; theme?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <Preview404 params={params} searchParams={searchParams} />
    </Suspense>
  );
}
