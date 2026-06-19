"use client";

// Global error boundary — catches errors thrown in the ROOT layout itself (which app/[lang]/error.tsx
// cannot, since it renders inside that layout). It REPLACES the whole document, so it must render its
// own <html>/<body> and link the Caladan stylesheet (global styles aren't inherited here). No locale
// context is available at this level, so copy uses the default locale (vi). Rare path; kept minimal.
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="vi">
      <head>
        <link rel="stylesheet" href="/assets/css/caladan-template.shared.28e174924.css" />
        <link rel="stylesheet" href="/assets/css/lenis.css" />
        <link rel="stylesheet" href="/assets/fonts/ibm-plex-mono.css" />
      </head>
      <body>
        <div className="utility_page-wrap _404">
          <div className="utility_page-content _404">
            <div className="w-layout-grid grid_404">
              <div className="content_404">
                <div className="master_label" data-wf--tag--variant="base">
                  <div className="label-small">Lỗi</div>
                </div>
                <div className="headline_404">
                  <div className="heading_404">
                    <h1 className="margin-0">Đã có sự cố <span className="tone-medium">xảy ra</span></h1>
                  </div>
                  <div className="_404_p">
                    <p className="tone-medium margin-0">Đã xảy ra lỗi không mong muốn. Vui lòng thử lại hoặc quay về trang chủ.</p>
                  </div>
                </div>
                <div className="error-page_actions">
                  <button type="button" button="" className="cta_primary w-inline-block" onClick={reset}>
                    <div className="button_text-mask">
                      <div button-text="" className="text-button">Thử lại</div>
                    </div>
                    <div button-bg="" className="btn-bg"></div>
                  </button>
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error replaces the whole document on a root crash; a full reload (plain <a>) is the correct recovery, not client-side next/link nav. */}
                  <a className="link-underline tone-medium" href="/">Về trang chủ</a>
                </div>
              </div>
              <div className="image_404">
                <img
                  alt="Xưởng sản xuất Signex"
                  className="image_cover"
                  loading="lazy"
                  src="/assets/images/69ac691927961ac98c560fe2_pexels-stephanlouis-19119918.avif"
                />
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
