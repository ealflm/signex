import type { Dictionary } from "@/app/[lang]/dictionaries";

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
export function Features({ dict }: { dict: Dictionary["features"] }) {
  const t = dict;

  return (
    <section className="section_features">
      <div className="padding-global">
        <div className="w-layout-blockcontainer container-large w-container">
          <div className="headline_features" data-w-id="0f29df12-8c38-da6f-794d-3989ac10d663" style={{ opacity: 0, filter: 'blur(5px)' }}>
            <div className="heading_features">
              <div className="master_label" data-wf--tag--variant="base">
                <div className="label-small">
                  {t.eyebrow}
                </div>
              </div>
              <h2 className="margin-0">
                {t.titleTop}
                <br />
                <span className="tone-medium">
                  {t.titleBottom}
                </span>
              </h2>
            </div>
            <div className="right_features-headline">
              <a button="" className="cta_primary w-inline-block" data-wf--cta-primary--variant="primary" href="#quote-form">
                <div className="button_text-mask">
                  <div button-text="" className="text-button">
                    {t.cta}
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
                  <img alt="Pexels saeb mahajna 14125913 6297105" className="image_cover is-parallax" loading="lazy" src="/assets/images/69a9746c7ab6e4371c4aae70_pexels-saeb-mahajna-14125913-6297105.avif" />
                  <div className="overlay_dark-16">
                  </div>
                </div>
                <a className="content_image-features is-horizontal w-inline-block" href="#quote-form">
                  <div className="features_text-tile">
                    <div className="text_body-bold">
                      {t.featured.title}
                    </div>
                    <p className="text-size-small">
                      {t.featured.desc}
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
                    {t.cards[0].title}
                  </div>
                  <p className="tone-medium margin-0">
                    {t.cards[0].desc}
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
                    {t.cards[1].title}
                  </div>
                  <p className="tone-medium margin-0">
                    {t.cards[1].desc}
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
                    {t.cards[2].title}
                  </div>
                  <p className="tone-medium margin-0">
                    {t.cards[2].desc}
                  </p>
                </div>
              </div>
              {/* Complementary workshop/process video (added content) */}
              <div className="video_features" id="w-node-_7592271b-69fa-3faa-e7e1-e8f1255559a7-5e872ff7">
                <div className="image-inner_features" data-w-id="7592271b-69fa-3faa-e7e1-e8f1255559a8">
                  <div className="video_cover w-background-video w-background-video-atom" data-autoplay="true" data-loop="true" data-poster-url="/assets/images/69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_poster.0000000.jpg" data-video-urls="/assets/videos/69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_mp4.mp4,/assets/videos/69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_webm.webm" data-wf-ignore="true">
                    <video autoPlay data-object-fit="cover" data-wf-ignore="true" id="40581aae-5301-9d32-a680-8d7bb2717107-video" loop muted playsInline style={{ backgroundImage: 'url("/assets/images/69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_poster.0000000.jpg")' }}>
                      <source data-wf-ignore="true" src="/assets/videos/69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_mp4.mp4" />
                      <source data-wf-ignore="true" src="/assets/videos/69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_webm.webm" />
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
              <img alt="" data-wf-bgvideo-fallback-img="true" src="/assets/images/69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_poster.0000000.jpg"/>` }} />
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
                  <div className="overlay_dark-16">
                  </div>
                </div>
                <div className="content_image-features">
                  <div className="text_body-bold">
                    {t.videoTitle}
                  </div>
                  <p className="text-size-small">
                    {t.videoText}
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
