// /products/<slug> — product CATEGORY DETAIL page. Cloned from signex-web-ref's "blog-b" layout
// (a featured hero block + a card grid), repurposed: the featured block presents the CATEGORY
// (tag + title + intro + Products/Materials stats), and the grid lists that category's products.
//
// ★ IX2 reveals: blog-b's reveal data-w-ids are registered under the blog-b page id in the DCDAA
// chunk, so this route is mapped to that profile in app/lib/webflow-bundles.ts (pathname
// startsWith "/products/"). The data-w-ids below are therefore kept VERBATIM from blog-b (page id
// matches → reveals/parallax fire), exactly like the /about (home-c) and /contact (contact-c) ports.
//
// Static: generateStaticParams enumerates the dict's category slugs; dynamicParams=false → an
// unknown slug 404s. Content is dict-driven (products.categories[].intro/items, EN + VI).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, DEFAULT_LOCALE } from "@/app/lib/i18n-config";
import { getDictionary } from "../../dictionaries";
import { buildMetadata } from "@/app/lib/seo";
import { categoryImage, productImage } from "@/app/lib/product-images";

// Under cacheComponents the `dynamicParams` route config is not allowed; slugs
// not in generateStaticParams render on demand then cache (invalid → notFound in-render).
export async function generateStaticParams() {
  const dict = await getDictionary(DEFAULT_LOCALE);
  return dict.products.categories.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params;
  const locale = hasLocale(lang) ? lang : DEFAULT_LOCALE;
  const dict = await getDictionary(locale);
  const cat = dict.products.categories.find((c) => c.slug === slug);
  if (!cat) return {};
  const m = dict.meta;
  return buildMetadata({ locale, meta: m, title: `${cat.title} | ${m.siteName}`, description: cat.intro, path: `/products/${slug}` });
}

export default async function CategoryDetailPage({ params }: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const idx = dict.products.categories.findIndex((c) => c.slug === slug);
  if (idx === -1) notFound(); // unknown category → 404
  const cat = dict.products.categories[idx];
  const stats = dict.products.statLabels;
  const t = dict.products.detail;
  const heroImg = categoryImage(idx);

  return (
    <>
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
                          {/* Caladan's author/date row, repurposed to the category's stats. */}
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
                {cat.items.map((p, i) => (
                  <div className="w-dyn-item" role="listitem" key={p.slug}>
                    {/* Each card links to the product detail page (zoomable image + info). */}
                    <a className="card_blog-b w-inline-block" href={`/products/${cat.slug}/${p.slug}`}>
                      <div className="wrap_image-blog-b" data-w-id="2a5ebab5-4e4d-85db-43cb-631c22168ac8">
                        <div className="image_blog-a">
                          <img alt={p.title} className="image_cover is-parallax" loading="lazy" src={productImage(i)} />
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
    </>
  );
}
