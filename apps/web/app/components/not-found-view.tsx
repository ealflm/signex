"use client";

// Client view for the 404 page. Locale is derived from the URL via usePathname() rather than a
// request-time API (headers()/cookies()) on purpose: reading request data in the server
// not-found.tsx opts the ENTIRE [lang] subtree out of static generation (defeating
// generateStaticParams + dynamicParams=false). A client component keeps the pages statically
// prerendered. We can't read LIVE data here (getSiteContent is server-only AND would force the
// subtree dynamic), so the copy is single-sourced from the build-time constant INITIAL_SNAPSHOT
// (a plain client-importable TS object — the notFound block as of the last build/seed), with the
// COPY literals below as the absolute fallback. NOTE: this 404 therefore reflects the notFound block
// at BUILD time, not live edits — the PREVIEW 404 (not-found-preview.tsx) is the live one.
import { usePathname } from "next/navigation";
import { LOCALES, DEFAULT_LOCALE, type Locale } from "@/app/lib/i18n-config";
import { INITIAL_SNAPSHOT } from "@/app/lib/initial-snapshot";

const COPY: Record<Locale, { eyebrow: string; title: string; accent: string; body: string; cta: string; alt: string }> = {
  en: {
    eyebrow: "404",
    title: "Looks like you've ",
    accent: "lost the thread",
    body: "The page you're looking for has moved or no longer exists. Let's get you back on track — Signex is ready to bring your brand identity to life.",
    cta: "Back to homepage",
    alt: "Signex production floor",
  },
  vi: {
    eyebrow: "404",
    title: "Có vẻ bạn đã ",
    accent: "đi lạc đường",
    body: "Trang bạn tìm kiếm đã được di chuyển hoặc không còn tồn tại. Hãy quay lại — Signex luôn sẵn sàng hiện thực hóa nhận diện thương hiệu của bạn.",
    cta: "Về trang chủ",
    alt: "Xưởng sản xuất Signex",
  },
};

export function NotFoundView() {
  const seg = usePathname().split("/")[1];
  const locale: Locale = (LOCALES as readonly string[]).includes(seg) ? (seg as Locale) : DEFAULT_LOCALE;
  // Single-source from the build-time notFound block, per-leaf fall back to the COPY literals so a
  // future schema gap can never blank the page. The image src stays the literal below (a client
  // component can't resolve r2Key → CDN URL); only its alt is sourced from the block.
  const nf = INITIAL_SNAPSHOT.blocks.notFound;
  const fallback = COPY[locale];
  const t = {
    eyebrow: nf.eyebrow?.[locale] ?? fallback.eyebrow,
    title: nf.title?.lead?.[locale] ?? fallback.title,
    accent: nf.title?.accent?.[locale] ?? fallback.accent,
    body: nf.body?.[locale] ?? fallback.body,
    cta: nf.cta?.label?.[locale] ?? fallback.cta,
    alt: nf.image?.alt?.[locale] ?? fallback.alt,
  };
  return (
    <div className="utility_page-wrap _404" data-sx-block="notFound">
      <div className="utility_page-content _404">
        <div className="w-layout-grid grid_404">
          <div className="content_404">
            <div className="master_label" data-wf--tag--variant="base">
              <div className="label-small">{t.eyebrow}</div>
            </div>
            <div className="headline_404">
              <div className="heading_404">
                <h1 className="margin-0">
                  {t.title}
                  <span className="tone-medium">{t.accent}</span>
                </h1>
              </div>
              <div className="_404_p">
                <p className="tone-medium margin-0">{t.body}</p>
              </div>
            </div>
            <a button="" className="cta_primary w-inline-block" data-wf--cta-primary--variant="primary" href={`/${locale}`}>
              <div className="button_text-mask">
                <div button-text="" className="text-button">{t.cta}</div>
              </div>
              <div button-bg="" className="btn-bg"></div>
            </a>
          </div>
          <div className="image_404">
            {/* not-found image: the src stays the literal — a 'use client' component can't resolve
                an asset r2Key → CDN URL (no server-only content access). The alt IS sourced from the
                build-time notFound block above (with COPY fallback). */}
            <img
              alt={t.alt}
              className="image_cover"
              loading="lazy"
              src="/assets/images/69ac691927961ac98c560fe2_pexels-stephanlouis-19119918.avif"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
