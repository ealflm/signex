// app/preview/[lang]/products/[slug]/page.tsx — EDITOR PREVIEW of a product CATEGORY DETAIL page
// (live working snapshot). Mirrors the public /products/<slug> body (app/[lang]/products/[slug]/page.tsx)
// — blog-b featured category hero + product card grid — but reads the WORKING snapshot
// (getPreviewSnapshot) and wraps it in the preview shell (Navbar/Footer editable + <EditOverlay/>).
// The category is resolved from the snapshot exactly like the public page (categories.find by slug;
// unknown slug → notFound()). Token-gated + force-dynamic identically to the home preview (see its
// header for the cacheComponents rationale): the page renders ONLY the <Suspense> boundary; ALL
// request-time work (connection(), searchParams, the uncached snapshot read) happens in the child.
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
import { PreviewRuntime } from "@/app/preview/preview-runtime";

async function PreviewCategory({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; slug: string }>;
  searchParams: Promise<{ secret?: string; theme?: string }>;
}) {
  await connection(); // request-time only — never prerender this subtree
  const { secret, theme } = await searchParams;
  if (!process.env.PREVIEW_SECRET || secret !== process.env.PREVIEW_SECRET) notFound();

  const { lang, slug } = await params;
  const locale = hasLocale(lang) ? lang : DEFAULT_LOCALE;
  const dict = await getPreviewSnapshot(locale, theme);
  const cat = dict.products.categories.find((c) => c.slug === slug);
  if (!cat) notFound(); // unknown category → 404 (same as the public page)
  const stats = dict.products.statLabels;
  const t = dict.products.detail;
  const heroImg = cat.image.url;

  return (
    <div className="page-wrapper">
      <Navbar dict={dict.nav} editable />
      <main id="main" className="main-wrapper">
        {/* Category hero — blog-b's "featured" block, repurposed to present the category itself. */}
        <section className="section_hero-blog-b" data-w-id="ad1a3029-1630-4dbd-9a8f-fd5ea3c4eb18">
          <div className="padding-global">
            <div className="w-layout-blockcontainer container-large w-container">
              <div className="blogs w-dyn-list" data-w-id="8f8401f9-3939-d0bc-a190-0631b0360192" style={{ opacity: 0, filter: 'blur(5px)' }}>
                <div className="w-dyn-items" role="list">
                  <div className="w-dyn-item" role="listitem">
                    <div className="master_featured-blog-b" data-w-id="8f8401f9-3939-d0bc-a190-0631b0360195">
                      <div className="image_feature-blog-b">
                        <img alt={cat.title} className="image_cover is-parallax" loading="lazy" src={heroImg} />
                        <div className="overlay_featured-blog">
                        </div>
                      </div>
                      <div className="inner_feautred-blog-b" id="w-node-_8f8401f9-3939-d0bc-a190-0631b0360199-f81de99c">
                        <div className="left_blog-a">
                          <div className="master_label w-variant-c635f48c-f4bf-10ac-538c-02acec5e3dd8" data-wf--tag--variant="darker">
                            <div className="label-small">
                              {cat.tag}
                            </div>
                          </div>
                          <h1 className="heading-style-h2">
                            {cat.title}
                          </h1>
                          <p className="tone-medium margin-0">
                            {cat.intro}
                          </p>
                        </div>
                        <div className="right_blog-a">
                          <div className="info-block_blog-a">
                            <div className="details_blog">
                              <div>
                                {cat.products} {stats.products}
                              </div>
                              <div>
                                •
                              </div>
                              <div>
                                {cat.materials} {stats.materials}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* Product list — blog-b's card grid, one card per product in this category. */}
        <section className="section_body-blog-b">
          <div className="padding-global">
            <div className="w-layout-blockcontainer container-large w-container">
              <div className="divider_faint mg-bottom-small">
              </div>
              <div className="headline_body-blog-b" data-w-id="9af4266a-1ee2-4b18-62fd-d84c271ea7d9" style={{ opacity: 0, filter: 'blur(5px)' }}>
                <h2 className="margin-0">
                  {t.listTitle}
                  <span className="tone-medium">
                    {t.listTitleAccent}
                  </span>
                </h2>
              </div>
              <div className="blogs w-dyn-list" data-w-id="2a5ebab5-4e4d-85db-43cb-631c22168ac4" style={{ opacity: 0, filter: 'blur(5px)' }}>
                <div className="grid_blog-b w-dyn-items" role="list">
                  {cat.items.map((p) => (
                    <div className="w-dyn-item" role="listitem" key={p.slug}>
                      {/* Each card links to the product detail page (the overlay rewrites this to its
                          /preview equivalent so edit mode is preserved). */}
                      <a className="card_blog-b w-inline-block" href={`/products/${cat.slug}/${p.slug}`}>
                        <div className="wrap_image-blog-b" data-w-id="2a5ebab5-4e4d-85db-43cb-631c22168ac8">
                          <div className="image_blog-a">
                            <img alt={p.title} className="image_cover is-parallax" loading="lazy" src={p.image.url} />
                          </div>
                          <div className="overlay_tag-home">
                            <div className="master_label w-variant-84e91bde-75c3-dd4c-a083-7846b4ae6170" data-wf--tag--variant="lighter">
                              <div className="label-small">
                                {p.tag}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="card-blog-b_content">
                          <div className="text_blog-card">
                            <div className="text-size-large text_body-bold">
                              {p.title}
                            </div>
                            <p className="tone-medium margin-0">
                              {p.desc}
                            </p>
                          </div>
                        </div>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
        <Footer dict={dict.footer} editable />
      </main>
      <EditOverlay />
      {/* Webflow boot in this dynamic subtree (not the layout) — see preview-runtime.tsx (#418 fix). */}
      <PreviewRuntime />
    </div>
  );
}

export default function PreviewCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; slug: string }>;
  searchParams: Promise<{ secret?: string; theme?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <PreviewCategory params={params} searchParams={searchParams} />
    </Suspense>
  );
}
