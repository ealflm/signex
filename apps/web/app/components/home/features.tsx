import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";
import { overlayCss } from "@signex/shared";

/**
 * Features — the section directly below the hero, adapted to signex's manufacturing
 * brand values. Caladan's design is kept 100%: same markup, classes, grid, images,
 * video, and IX2 reveal bindings (data-w-id). Only the TEXT is swapped (from the
 * per-locale dictionary) and the three resort icons are replaced with manufacturing
 * glyphs that reuse the exact same Caladan icon markup (.icon_service-card / lucide
 * stroke icons), so the visual design is unchanged.
 *
 * Content mapping (preserves the four value cards + their 1→4 reading order):
 *   ① featured image tile  → Consistent Production Quality
 *   ② icon card            → Transparent Manufacturing Processes  (eye)
 *   ③ icon card            → Long-Term Cooperation Mindset        (handshake)
 *   ④ icon card            → Respect for Brand Integrity          (shield-check)
 *   video tile             → complementary workshop/process clip  (added content)
 */
export function Features({ dict, editable = false }: { dict: Dictionary["features"]; editable?: boolean }) {
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

  return (
    <section className="section_features" data-sx-block="features">
      <div className="padding-global">
        <div className="w-layout-blockcontainer container-large w-container">
          <div className="headline_features" data-w-id="0f29df12-8c38-da6f-794d-3989ac10d663" style={{ opacity: 0, filter: 'blur(5px)' }}>
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
                <div button-bg="" className="btn-bg">
                </div>
              </a>
            </div>
          </div>
          <div className="master_features">
            <div className="w-layout-grid grid_features-2">
              {/* ① Featured value — Consistent Production Quality */}
              <div className="image_features">
                <div className="image-inner_features" data-w-id="d354a09c-1c94-8247-3fc0-60e3f5ed678a">
                  {/* featured tile: now a configurable MediaRef (features.featured.image) — image OR
                      video; falls back to the original literal still when no asset is attached. */}
                  {t.featured.media?.kind === "video" ? (
                    <video
                      autoPlay
                      className="image_cover is-parallax"
                      loop
                      muted
                      playsInline
                      poster={t.featured.media.posterUrl}
                      {...editableAttrs(editable, "features.featured.image", { image: true, video: true })}
                    >
                      <source src={t.featured.media.mp4Url} type="video/mp4" />
                      {t.featured.media.webmUrl && <source src={t.featured.media.webmUrl} type="video/webm" />}
                    </video>
                  ) : (
                    <img
                      alt={(t.featured.media?.kind === "image" && t.featured.media.alt) || "Pexels saeb mahajna 14125913 6297105"}
                      className="image_cover is-parallax"
                      loading="lazy"
                      src={(t.featured.media?.kind === "image" && t.featured.media.url) || "/assets/images/69a9746c7ab6e4371c4aae70_pexels-saeb-mahajna-14125913-6297105.avif"}
                      {...editableAttrs(editable, "features.featured.image", { image: true, video: true })}
                    />
                  )}
                  <div className="overlay_media-config" style={overlayCss(t.featured.overlay)} {...(editable ? { "data-sx-overlay": "features.featured.overlay" } : {})} />
                </div>
                <a className="content_image-features is-horizontal w-inline-block" href="#quote-form">
                  <div className="features_text-tile">
                    <div className="text_body-bold">
                      <span {...editableAttrs(editable, "features.featured.title", { text: { maxLength: 80 } })}>{t.featured.title}</span>
                    </div>
                    <p className="text-size-small">
                      <span {...editableAttrs(editable, "features.featured.desc", { text: { maxLength: 200 } })}>{t.featured.desc}</span>
                    </p>
                  </div>
                  <div className="icon_arrow-right w-embed">
                    <svg className="lucide lucide-arrow-up-right-icon lucide-arrow-up-right" fill="none" height="100%" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="100%" xmlns="http://www.w3.org/2000/svg">
                      <path d="M7 7h10v10">
                      </path>
                      <path d="M7 17 17 7">
                      </path>
                    </svg>
                  </div>
                </a>
              </div>
              {/* ② Transparent Manufacturing Processes */}
              <div className="card_service-v2">
                <div className="wrap_icon-service-card">
                  <div className="icon_service-card w-embed">
                    <svg className="lucide lucide-eye-icon lucide-eye" fill="none" height="100%" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="var(--_❇️-icon---icon-stroke)" viewBox="0 0 24 24" width="100%" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0">
                      </path>
                      <circle cx="12" cy="12" r="3">
                      </circle>
                    </svg>
                  </div>
                </div>
                <div className="wrap_text-service-card">
                  <div className="text-size-large text_body-bold">
                    <span {...editableAttrs(editable, "features.cards.0.title", { text: { maxLength: 80 } })}>{t.cards[0].title}</span>
                  </div>
                  <p className="tone-medium margin-0">
                    <span {...editableAttrs(editable, "features.cards.0.desc", { text: { maxLength: 200 } })}>{t.cards[0].desc}</span>
                  </p>
                </div>
              </div>
            </div>
            <div className="w-layout-grid grid_features-3">
              {/* ③ Long-Term Cooperation Mindset */}
              <div className="card_service-v2">
                <div className="wrap_icon-service-card">
                  <div className="icon_service-card w-embed">
                    <svg className="lucide lucide-handshake-icon lucide-handshake" fill="none" height="100%" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="var(--_❇️-icon---icon-stroke)" viewBox="0 0 24 24" width="100%" xmlns="http://www.w3.org/2000/svg">
                      <path d="m11 17 2 2a1 1 0 1 0 3-3">
                      </path>
                      <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4">
                      </path>
                      <path d="m21 3 1 11h-2">
                      </path>
                      <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3">
                      </path>
                      <path d="M3 4h8">
                      </path>
                    </svg>
                  </div>
                </div>
                <div className="wrap_text-service-card">
                  <div className="text-size-large text_body-bold">
                    <span {...editableAttrs(editable, "features.cards.1.title", { text: { maxLength: 80 } })}>{t.cards[1].title}</span>
                  </div>
                  <p className="tone-medium margin-0">
                    <span {...editableAttrs(editable, "features.cards.1.desc", { text: { maxLength: 200 } })}>{t.cards[1].desc}</span>
                  </p>
                </div>
              </div>
              {/* ④ Respect for Brand Integrity */}
              <div className="card_service-v2">
                <div className="wrap_icon-service-card">
                  <div className="icon_service-card w-embed">
                    <svg className="lucide lucide-shield-check-icon lucide-shield-check" fill="none" height="100%" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="var(--_❇️-icon---icon-stroke)" viewBox="0 0 24 24" width="100%" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z">
                      </path>
                      <path d="m9 12 2 2 4-4">
                      </path>
                    </svg>
                  </div>
                </div>
                <div className="wrap_text-service-card">
                  <div className="text-size-large text_body-bold">
                    <span {...editableAttrs(editable, "features.cards.2.title", { text: { maxLength: 80 } })}>{t.cards[2].title}</span>
                  </div>
                  <p className="tone-medium margin-0">
                    <span {...editableAttrs(editable, "features.cards.2.desc", { text: { maxLength: 200 } })}>{t.cards[2].desc}</span>
                  </p>
                </div>
              </div>
              {/* Complementary workshop/process video (added content) */}
              <div className="video_features" id="w-node-_7592271b-69fa-3faa-e7e1-e8f1255559a7-5e872ff7">
                <div className="image-inner_features" data-w-id="7592271b-69fa-3faa-e7e1-e8f1255559a8">
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
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
