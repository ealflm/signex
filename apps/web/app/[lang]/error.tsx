"use client";

// App Router error boundary for the [lang] segment — catches render/runtime errors in any page
// under /<locale>/* and shows a branded recovery screen (inside the navbar/footer layout). Must be
// a Client Component. Reuses Caladan's _404 utility layout (same as not-found) so it needs no new
// CSS; locale-aware copy is derived from the URL (error.tsx receives no route params).
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { LOCALES, DEFAULT_LOCALE, type Locale } from "@/app/lib/i18n-config";

const COPY: Record<Locale, { eyebrow: string; title: string; accent: string; body: string; retry: string; home: string; alt: string }> = {
  en: {
    eyebrow: "Error",
    title: "Something went ",
    accent: "off track",
    body: "An unexpected error occurred. You can try again, or head back to the homepage.",
    retry: "Try again",
    home: "Back to homepage",
    alt: "Signex production floor",
  },
  vi: {
    eyebrow: "Lỗi",
    title: "Đã có sự cố ",
    accent: "xảy ra",
    body: "Đã xảy ra lỗi không mong muốn. Bạn có thể thử lại, hoặc quay về trang chủ.",
    retry: "Thử lại",
    home: "Về trang chủ",
    alt: "Xưởng sản xuất Signex",
  },
};

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const seg = usePathname().split("/")[1];
  const locale: Locale = (LOCALES as readonly string[]).includes(seg) ? (seg as Locale) : DEFAULT_LOCALE;
  const t = COPY[locale];

  useEffect(() => {
    console.error(error);
  }, [error]);

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
            <div className="error-page_actions">
              <button type="button" button="" className="cta_primary w-inline-block" onClick={reset}>
                <div className="button_text-mask">
                  <div button-text="" className="text-button">{t.retry}</div>
                </div>
                <div button-bg="" className="btn-bg"></div>
              </button>
              <a className="link-underline tone-medium" href={`/${locale}`}>{t.home}</a>
            </div>
          </div>
          <div className="image_404">
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
