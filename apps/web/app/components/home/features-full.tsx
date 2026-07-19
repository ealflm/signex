// app/components/home/features-full.tsx
// The ABOUT-page "Vì Sao Các Thương Hiệu Chọn Chúng Tôi" block — header (eyebrow + title + CTA) in the
// container, then ONE full-width row of 5 equal cells: the workshop video (1/5) + the 4 criteria
// (boxless, icon + title + desc). Same features data as the homepage USP bar (shared buildCriteria).
// NO data-w-id reveals here — those ids are home-registered and would leave this invisible on /about.
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";
import { overlayCss } from "@signex/shared";
import { buildCriteria } from "@/app/components/home/features-criteria-data";

export function FeaturesFull({
  dict,
  editable = false,
}: {
  dict: Dictionary["features"];
  editable?: boolean;
}) {
  const t = dict;
  // Workshop video: configurable MediaRef (features.video.media) — image OR video. All-or-nothing
  // fallback — when a custom mp4 is attached, emit webm only if the editor provided one; the stock
  // webm belongs solely to the full literal fallback (never spliced next to a custom mp4).
  const featVideo = t.videoMedia?.kind === "video" ? t.videoMedia : null;
  const featPoster =
    featVideo?.posterUrl ||
    "/assets/images/69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_poster.0000000.jpg";
  const featMp4 =
    featVideo?.mp4Url ||
    "/assets/videos/69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_mp4.mp4";
  const featWebm = featVideo
    ? featVideo.webmUrl
    : "/assets/videos/69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_webm.webm";
  const criteria = buildCriteria(dict);
  return (
    <section className="section_features" data-sx-block="features">
      <div className="padding-global">
        <div className="w-layout-blockcontainer container-large w-container">
          <div className="headline_features">
            <div className="heading_features">
              <div className="master_label" data-wf--tag--variant="base">
                <div className="label-small">
                  <span {...editableAttrs(editable, "features.eyebrow", { text: { maxLength: 80 } })}>{t.eyebrow}</span>
                </div>
              </div>
              <h2 className="margin-0">
                <span {...editableAttrs(editable, "features.title.lead", { text: { maxLength: 80 } })}>{t.titleTop}</span>
                <br />
                <span className="tone-medium" {...editableAttrs(editable, "features.title.accent", { text: { maxLength: 80 } })}>
                  {t.titleBottom}
                </span>
              </h2>
            </div>
            <div className="right_features-headline">
              <a button="" className="cta_primary w-inline-block" data-wf--cta-primary--variant="primary" href="#quote-form">
                <div className="button_text-mask">
                  <div button-text="" className="text-button">
                    <span {...editableAttrs(editable, "features.cta.label", { text: { maxLength: 80 } })}>{t.cta}</span>
                  </div>
                </div>
                <div button-bg="" className="btn-bg"></div>
              </a>
            </div>
          </div>
        </div>
        {/* Full-width 5-cell row (breaks out of container-large; header above stays centred). */}
        <div className="sx-features-row5">
          <div className="sx-features-cell sx-features-cell--video">
            <div className="image-inner_features">
              {/* workshop tile: configurable MediaRef (features.video.media) — image OR video;
                  the elaborate Webflow background-video markup below is the VIDEO branch, kept
                  verbatim (falls back to the stock clip when unset). */}
              {t.videoMedia?.kind === "image" ? (
                <img
                  alt={t.videoMedia.alt}
                  className="image_cover"
                  src={t.videoMedia.url}
                  {...editableAttrs(editable, "features.video.media", { image: true, video: true })}
                />
              ) : (
              <div
                className="video_cover w-background-video w-background-video-atom"
                data-autoplay="true"
                data-loop="true"
                data-poster-url={featPoster}
                data-video-urls={[featMp4, featWebm].filter(Boolean).join(",")}
                data-wf-ignore="true"
                {...editableAttrs(editable, "features.video.media", { image: true, video: true })}
              >
                <video autoPlay data-object-fit="cover" data-wf-ignore="true" id="40581aae-5301-9d32-a680-8d7bb2717107-video" loop muted playsInline style={{ backgroundImage: `url("${featPoster}")` }}>
                  <source data-wf-ignore="true" src={featMp4} />
                  {featWebm && <source data-wf-ignore="true" src={featWebm} />}
                </video>
                <noscript dangerouslySetInnerHTML={{ __html: `<style>
           [data-wf-bgvideo-fallback-img] {
    display: none;
  }
  @media (prefers-reduced-motion: reduce) {
    [data-wf-bgvideo-fallback-img] {
      position: absolute;
      z-index: -100;
      display: inline-block;
      height: 100%;
      width: 100%;
      object-fit: cover;
    }
  }
              </style>
              <img alt="" data-wf-bgvideo-fallback-img="true" src="${featPoster}"/>` }} />
                <div aria-live="polite">
                  <button aria-controls="40581aae-5301-9d32-a680-8d7bb2717107-video" className="w-backgroundvideo-backgroundvideoplaypausebutton button_play-pause w-background-video--control" data-w-bg-video-control="true" type="button">
                    <span className="play-state">
                      <div className="icon_play w-embed">
                        <svg fill="none" height="16" viewBox="0 0 16 16" width="16" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12.0002 2L10.0002 2C9.63197 2 9.3335 2.29848 9.3335 2.66667V13.3333C9.3335 13.7015 9.63197 14 10.0002 14H12.0002C12.3684 14 12.6668 13.7015 12.6668 13.3333L12.6668 2.66667C12.6668 2.29848 12.3684 2 12.0002 2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                          </path>
                          <path d="M6.00016 2L4.00016 2C3.63197 2 3.3335 2.29848 3.3335 2.66667L3.3335 13.3333C3.3335 13.7015 3.63197 14 4.00016 14H6.00016C6.36835 14 6.66683 13.7015 6.66683 13.3333L6.66683 2.66667C6.66683 2.29848 6.36835 2 6.00016 2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                          </path>
                        </svg>
                      </div>
                    </span>
                    <span className="play-state" hidden>
                      <div className="icon_play w-embed">
                        <svg fill="none" height="16" viewBox="0 0 16 16" width="16" xmlns="http://www.w3.org/2000/svg">
                          <path d="M3.3335 3.33373C3.33343 3.09912 3.39526 2.86865 3.51275 2.66559C3.63024 2.46252 3.79924 2.29406 4.00266 2.17719C4.20609 2.06033 4.43675 1.99921 4.67136 2.00001C4.90596 2.0008 5.1362 2.06349 5.33883 2.18173L13.3368 6.84706C13.5387 6.96418 13.7062 7.13222 13.8228 7.3344C13.9393 7.53657 14.0008 7.76579 14.001 7.99915C14.0012 8.23251 13.9401 8.46184 13.8239 8.66422C13.7077 8.86659 13.5405 9.03492 13.3388 9.15239L5.33883 13.8191C5.1362 13.9373 4.90596 14 4.67136 14.0008C4.43675 14.0016 4.20609 13.9405 4.00266 13.8236C3.79924 13.7067 3.63024 13.5383 3.51275 13.3352C3.39526 13.1321 3.33343 12.9017 3.3335 12.6671L3.3335 3.33373Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                          </path>
                        </svg>
                      </div>
                    </span>
                  </button>
                </div>
              </div>
              )}
              <div className="overlay_media-config" style={overlayCss(t.videoOverlay)} {...(editable ? { "data-sx-overlay": "features.video.overlay" } : {})} />
            </div>
            <div className="content_image-features">
              <div className="text_body-bold">
                <span {...editableAttrs(editable, "features.video.title", { text: { maxLength: 80 } })}>{t.videoTitle}</span>
              </div>
              <p className="text-size-small">
                <span {...editableAttrs(editable, "features.video.text", { text: { maxLength: 200 } })}>{t.videoText}</span>
              </p>
            </div>
          </div>
          {criteria.map((c, i) => (
            <div className="sx-features-cell" key={i}>
              <div className="icon_service-card w-embed">{c.icon}</div>
              <div className="text-size-large text_body-bold">
                <span {...editableAttrs(editable, c.titleField, { text: { maxLength: 80 } })}>{c.title}</span>
              </div>
              <p className="tone-medium margin-0">
                <span {...editableAttrs(editable, c.descField, { text: { maxLength: 200 } })}>{c.desc}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
