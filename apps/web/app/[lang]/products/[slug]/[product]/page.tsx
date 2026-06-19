// /products/<category>/<product> — single product DETAIL page. A large zoomable product image
// (ProductImageZoom: click → full-screen zoom/pan lightbox) beside the product info (category
// eyebrow, name, material, description) + a "Request a Quote" CTA. Built from Caladan primitives
// (padding-global / container-large / master_label / heading-style / cta_primary) + scoped
// .product-detail_* layout in globals.css. Rendered statically (no IX2 scroll-reveal — the zoom
// is the interaction). Static params: every category × product (× en/vi); dynamicParams=false.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, DEFAULT_LOCALE } from "@/app/lib/i18n-config";
import { getDictionary } from "../../../dictionaries";
import { buildMetadata } from "@/app/lib/seo";
import { ProductImageZoom } from "@/app/components/product-image-zoom";
import { productImage } from "@/app/lib/product-images";

export const dynamicParams = false;
export async function generateStaticParams() {
  const dict = await getDictionary(DEFAULT_LOCALE);
  return dict.products.categories.flatMap((c) =>
    c.items.map((it) => ({ slug: c.slug, product: it.slug }))
  );
}

function locate(dict: Awaited<ReturnType<typeof getDictionary>>, slug: string, product: string) {
  const cat = dict.products.categories.find((c) => c.slug === slug);
  if (!cat) return null;
  const itemIdx = cat.items.findIndex((it) => it.slug === product);
  if (itemIdx === -1) return null;
  return { cat, item: cat.items[itemIdx], itemIdx };
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string; slug: string; product: string }> }): Promise<Metadata> {
  const { lang, slug, product } = await params;
  const locale = hasLocale(lang) ? lang : DEFAULT_LOCALE;
  const dict = await getDictionary(locale);
  const found = locate(dict, slug, product);
  if (!found) return {};
  const m = dict.meta;
  return buildMetadata({
    locale,
    meta: m,
    title: `${found.item.title} | ${m.siteName}`,
    description: found.item.desc,
    path: `/products/${slug}/${product}`,
  });
}

export default async function ProductDetailPage({ params }: { params: Promise<{ lang: string; slug: string; product: string }> }) {
  const { lang, slug, product } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const found = locate(dict, slug, product);
  if (!found) notFound(); // unknown category or product → 404
  const { cat, item, itemIdx } = found;
  const pl = dict.products.product;
  const image = productImage(itemIdx);

  return (
    <section className="section_product-detail">
      <div className="padding-global">
        <div className="w-layout-blockcontainer container-large w-container">
          <a className="product-detail_back link-underline tone-medium" href={`/products/${cat.slug}`}>
            ← {pl.back}{cat.title}
          </a>
          <div className="product-detail_grid">
            <div className="product-detail_media">
              <ProductImageZoom src={image} alt={item.title} hint={pl.zoomHint} />
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
              <p className="tone-medium product-detail_desc">
                {item.desc}
              </p>
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
  );
}
