// app/preview/[lang]/products/[slug]/[product]/page.tsx — EDITOR PREVIEW of a product DETAIL
// page (live working snapshot). Mirrors the public /products/<slug>/<product> body
// (app/[lang]/products/[slug]/[product]/page.tsx) — back link + product-detail_grid (zoomable
// image + info + CTA) — but reads the WORKING snapshot (getPreviewSnapshot) and wraps it in the
// preview shell (Navbar/Footer editable + <EditOverlay/>). The category + product are resolved
// from the snapshot exactly like the public page (categories.find by slug, then items.find by
// slug; either missing → notFound()). Token-gated + force-dynamic identically to the category
// preview (see its header for the cacheComponents rationale): the page renders ONLY the
// <Suspense> boundary; ALL request-time work (connection(), searchParams, the uncached snapshot
// read) happens in the child.
//
// NOTE: no generateStaticParams / generateMetadata here — preview routes are always dynamic
// (connection()), so slugs resolve on demand from the working snapshot.
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { hasLocale, DEFAULT_LOCALE } from "@/app/lib/i18n-config";
import { getPreviewSnapshot } from "@/app/lib/content";
import { Navbar } from "@/app/components/navbar";
import { Footer } from "@/app/components/footer";
import { EditOverlay } from "@/app/components/editor/edit-overlay";
import { PaletteStyle } from "@/app/components/editor/palette-style";
import { PreviewRuntime } from "@/app/preview/preview-runtime";
import { FloatingContact } from "@/app/components/floating-contact";
import { ProductImageZoom } from "@/app/components/product-image-zoom";
import { overlayCss } from "@signex/shared";

async function PreviewProduct({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; slug: string; product: string }>;
  searchParams: Promise<{ secret?: string; theme?: string }>;
}) {
  await connection(); // request-time only — never prerender this subtree
  const { secret, theme } = await searchParams;
  if (!process.env.PREVIEW_SECRET || secret !== process.env.PREVIEW_SECRET) notFound();

  const { lang, slug, product } = await params;
  const locale = hasLocale(lang) ? lang : DEFAULT_LOCALE;
  const dict = await getPreviewSnapshot(locale, theme);
  const cat = dict.products.categories.find((c) => c.slug === slug);
  const item = cat?.items.find((i) => i.slug === product);
  if (!cat || !item) notFound(); // unknown category or product → 404 (same as the public page)
  const pl = dict.products.product;
  const image = item.image.url;

  return (
    <div className="page-wrapper">
      <PaletteStyle palette={dict.palette} />
      <Navbar dict={dict.nav} editable />
      <main id="main" className="main-wrapper">
        <section className="section_product-detail">
          <div className="padding-global">
            <div className="w-layout-blockcontainer container-large w-container">
              <a className="product-detail_back link-underline tone-medium" href={`/products/${cat.slug}`}>
                ← {pl.back}{cat.title}
              </a>
              <div className="product-detail_grid">
                <div className="product-detail_media">
                  <ProductImageZoom src={image} alt={item.title} hint={pl.zoomHint} />
                  <div className="overlay_media-config" style={overlayCss(dict.products.productImageOverlay)} data-sx-overlay="productsHeader.productImageOverlay" />
                </div>
                <div className="product-detail_info">
                  <div className="master_label" data-wf--tag--variant="base">
                    <div className="label-small">
                      {cat.tag}
                    </div>
                  </div>
                  <h1 className="heading-style-h2 margin-0">
                    {item.title}
                  </h1>
                  <div className="product-detail_meta tone-medium">
                    <strong>{pl.categoryLabel}:</strong> {cat.title}
                    <span className="product-detail_dot">•</span>
                    <strong>{pl.materialLabel}:</strong> {item.tag}
                  </div>
                  {item.desc && (
                    <p className="tone-medium product-detail_desc">{item.desc}</p>
                  )}
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Webflow-runtime nav, not next/link */}
                  <a button="" className="cta_primary w-inline-block" data-wf--cta-primary--variant="primary" href="/contact">
                    <div className="button_text-mask">
                      <div button-text="" className="text-button">
                        {pl.cta}
                      </div>
                    </div>
                    <div button-bg="" className="btn-bg" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
        <Footer dict={dict.footer} editable />
        <FloatingContact dict={dict} />
      </main>
      <EditOverlay />
      {/* Webflow boot in this dynamic subtree (not the layout) — see preview-runtime.tsx (#418 fix). */}
      <PreviewRuntime />
    </div>
  );
}

export default function PreviewProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; slug: string; product: string }>;
  searchParams: Promise<{ secret?: string; theme?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <PreviewProduct params={params} searchParams={searchParams} />
    </Suspense>
  );
}
