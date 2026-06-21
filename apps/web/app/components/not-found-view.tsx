"use client";

// Client view for the 404 page. Locale is derived from the URL via usePathname() rather than a
// request-time API (headers()/cookies()) on purpose: reading request data in the server
// not-found.tsx opts the ENTIRE [lang] subtree out of static generation (defeating
// generateStaticParams + dynamicParams=false). A client component keeps the pages statically
// prerendered. Copy is inlined (the dict is server-only and can't be imported here) — same
// trade-off as app/[lang]/error.tsx. Reuses Caladan's _404 utility layout.
import { usePathname } from "next/navigation";
import { LOCALES, DEFAULT_LOCALE, type Locale } from "@/app/lib/i18n-config";

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
  const t = COPY[locale];
  return (
    <div className="utility_page-wrap _404">
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
            {/* not-found image: stays hardcoded — this is a 'use client' component; cannot
                consume server-only SiteContent (Task 61b). notFound.imageUrl is populated in
                content.ts + en.json for schema completeness but unused here. */}
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
