// app/components/not-found-preview.tsx
// Server component rendering the 404 page driven by the live snapshot — for the preview
// editor surface ONLY (/preview/[lang]/404). The public not-found.tsx uses a 'use client'
// NotFoundView with hard-coded copy (cannot consume server-only SiteContent; see Task 61b).
// This component fills that gap in preview, making the notFound block inline-editable and
// closing the notFound.image media-stamp gap.
import type { SiteContent } from "@/app/lib/content";
import type { Locale } from "@/app/lib/i18n-config";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";

export function NotFoundPreview({
  dict,
  locale,
  editable = false,
}: {
  dict: SiteContent;
  locale: Locale;
  editable?: boolean;
}) {
  const t = dict.notFound;

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
                  <span {...editableAttrs(editable, "notFound.title.lead", { text: { maxLength: 80 } })}>{t.title}</span>
                  <span className="tone-medium" {...editableAttrs(editable, "notFound.title.accent", { text: { maxLength: 80 } })}>
                    {t.titleAccent}
                  </span>
                </h1>
              </div>
              <div className="_404_p">
                <p className="tone-medium margin-0">
                  <span {...editableAttrs(editable, "notFound.body", { text: { maxLength: 200 } })}>{t.body}</span>
                </p>
              </div>
            </div>
            <a button="" className="cta_primary w-inline-block" data-wf--cta-primary--variant="primary" href={`/${locale}`}>
              <div className="button_text-mask">
                <div button-text="" className="text-button">
                  <span {...editableAttrs(editable, "notFound.cta.label", { text: { maxLength: 80 } })}>{t.cta}</span>
                </div>
              </div>
              <div button-bg="" className="btn-bg" />
            </a>
          </div>
          <div className="image_404">
            {/* notFound.image: configurable AssetRef (closes the media-stamp gap for preview).
                Falls back to the literal pexels still when imageUrl is "". */}
            <img
              alt={t.imageAlt || "Signex production floor"}
              className="image_cover"
              loading="lazy"
              src={t.imageUrl || "/assets/images/69ac691927961ac98c560fe2_pexels-stephanlouis-19119918.avif"}
              {...editableAttrs(editable, "notFound.image", { image: true })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
