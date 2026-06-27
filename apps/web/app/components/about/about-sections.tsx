// app/components/about/about-sections.tsx
// The /about page body, extracted VERBATIM from app/[lang]/about/page.tsx so it can be reused by
// BOTH the public cached/SSG route AND the /preview editor route (single source — no fork). The
// only addition over the original inline markup is the optional `editable` prop, which stamps the
// visual-editor data-* hooks on the two media zones (aboutPage.hero.video, aboutPage.testimonial.image)
// via editAttrs() — a no-op on public renders (editable=false), so the static HTML is unchanged.
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editAttrs, editText } from "@/app/lib/edit-attrs";

// lucide line icons for the manufacturing-approach cards (index-aligned with aboutPage.approach),
// chosen per card content: factory (direct/in-house), badge-check (brand standards), lock
// (confidentiality). Same icon style used elsewhere (stroke=currentColor, 24 viewBox).
const SVG_PROPS = {
  fill: "none",
  height: 24,
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 2,
  viewBox: "0 0 24 24",
  width: 24,
  xmlns: "http://www.w3.org/2000/svg",
} as const;
const APPROACH_ICONS = [
  <svg key="factory" {...SVG_PROPS}>
    <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    <path d="M17 18h1" />
    <path d="M12 18h1" />
    <path d="M7 18h1" />
  </svg>,
  <svg key="badge-check" {...SVG_PROPS}>
    <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>,
  <svg key="lock" {...SVG_PROPS}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>,
];

export function AboutSections({ dict, editable = false }: { dict: Dictionary; editable?: boolean }) {
  // about hero video is now a configurable VideoRef (aboutPage.hero.videoMedia); fall back to the
  // original literal poster+mp4+webm when no asset is attached (published v1 snapshot stays valid).
  const heroVideo = dict.aboutPage.hero.videoMedia;
  // All-or-nothing fallback: a configured VideoRef requires poster+mp4 (webm optional), so when an
  // mp4 is attached use ONLY the configured sources (emit webm just if the editor provided one).
  // The stock webm belongs solely to the full literal fallback — never splice it next to a custom mp4.
  const hasCustomVideo = !!heroVideo.mp4Url;
  const heroPoster = heroVideo.posterUrl || "/assets/images/69b06b4bfbdb2da284a4ec5e_8440992-uhd_2732_1440_25fps_poster.0000000.jpg";
  const heroMp4 = heroVideo.mp4Url || "/assets/videos/69b06b4bfbdb2da284a4ec5e_8440992-uhd_2732_1440_25fps_mp4.mp4";
  const heroWebm = hasCustomVideo ? heroVideo.webmUrl : "/assets/videos/69b06b4bfbdb2da284a4ec5e_8440992-uhd_2732_1440_25fps_webm.webm";
  return (
    <>
      <section className="section_hero-home-c">
        {/* about hero video: configurable VideoRef (aboutPage.hero.video); literal fallback below */}
        <div
          className="master_hero-home-c w-background-video w-background-video-atom"
          data-autoplay="true"
          data-loop="true"
          data-poster-url={heroPoster}
          data-video-urls={[heroMp4, heroWebm].filter(Boolean).join(",")}
          data-wf-ignore="true"
          {...editAttrs(editable, "aboutPage.hero.video", "video")}
        >
          <video
            autoPlay
            data-object-fit="cover"
            data-wf-ignore="true"
            id="532ef140-c6a2-edd2-7d75-66929c4acf39-video"
            loop
            muted
            playsInline
            style={{ backgroundImage: `url("${heroPoster}")` }}
          >
            <source data-wf-ignore="true" src={heroMp4} />
            {heroWebm && <source data-wf-ignore="true" src={heroWebm} />}
          </video>
          <div className="content_hero-home-c">
            <div className="headline_home-c" data-w-id="532ef140-c6a2-edd2-7d75-66929c4acf3b" style={{ opacity: 0, filter: 'blur(5px)' }}>
              <div className="heading_hero-home-c">
                <div className="title_home-c">
                  <h1 className="heading-style-h0">
                    <span {...editText(editable, "aboutPage.hero.title.lead", { maxLength: 80 })}>{dict.aboutPage.hero.title}</span>
                    <span className="tone-medium" {...editText(editable, "aboutPage.hero.title.accent", { maxLength: 80 })}>
                      {dict.aboutPage.hero.titleAccent}
                    </span>
                  </h1>
                </div>
                <div className="p_hero-home-c">
                  <p className="margin-0">
                    <span {...editText(editable, "aboutPage.hero.subtitle", { maxLength: 200 })}>{dict.aboutPage.hero.subtitle}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="overlay_hero-home-b"></div>
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
            </style><img alt="" data-wf-bgvideo-fallback-img="true" src="${heroPoster}"/>` }} />
          <div aria-live="polite">
            <button
              aria-controls="532ef140-c6a2-edd2-7d75-66929c4acf39-video"
              className="w-backgroundvideo-backgroundvideoplaypausebutton button_play-pause w-background-video--control"
              data-w-bg-video-control="true"
              type="button"
            >
              <span className="play-state">
                <div className="icon_play w-embed">
                  <svg fill="none" height="16" viewBox="0 0 16 16" width="16" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12.0002 2L10.0002 2C9.63197 2 9.3335 2.29848 9.3335 2.66667V13.3333C9.3335 13.7015 9.63197 14 10.0002 14H12.0002C12.3684 14 12.6668 13.7015 12.6668 13.3333L12.6668 2.66667C12.6668 2.29848 12.3684 2 12.0002 2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"></path>
                    <path d="M6.00016 2L4.00016 2C3.63197 2 3.3335 2.29848 3.3335 2.66667L3.3335 13.3333C3.3335 13.7015 3.63197 14 4.00016 14H6.00016C6.36835 14 6.66683 13.7015 6.66683 13.3333L6.66683 2.66667C6.66683 2.29848 6.36835 2 6.00016 2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </div>
              </span>
              <span className="play-state" hidden>
                <div className="icon_play w-embed">
                  <svg fill="none" height="16" viewBox="0 0 16 16" width="16" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3.3335 3.33373C3.33343 3.09912 3.39526 2.86865 3.51275 2.66559C3.63024 2.46252 3.79924 2.29406 4.00266 2.17719C4.20609 2.06033 4.43675 1.99921 4.67136 2.00001C4.90596 2.0008 5.1362 2.06349 5.33883 2.18173L13.3368 6.84706C13.5387 6.96418 13.7062 7.13222 13.8228 7.3344C13.9393 7.53657 14.0008 7.76579 14.001 7.99915C14.0012 8.23251 13.9401 8.46184 13.8239 8.66422C13.7077 8.86659 13.5405 9.03492 13.3388 9.15239L5.33883 13.8191C5.1362 13.9373 4.90596 14 4.67136 14.0008C4.43675 14.0016 4.20609 13.9405 4.00266 13.8236C3.79924 13.7067 3.63024 13.5383 3.51275 13.3352C3.39526 13.1321 3.33343 12.9017 3.3335 12.6671L3.3335 3.33373Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </div>
              </span>
            </button>
          </div>
        </div>
      </section>
      <section>
        <div className="padding-global">
          <div className="w-layout-blockcontainer container-large w-container"></div>
        </div>
      </section>
      {/* Testimonials — home-a "testimonials-v2" slider ported from signex-web-ref, inserted
          above section_home-about. Headline reveal data-w-id re-pointed from the home-a trigger
          (af30d5d7 — not registered under /about's home-c data-wf-page) to the now-unused home-c
          stats reveal id (8dd77407) so it fades in like the rest of /about; the slider is a global
          Webflow component. Caladan placeholder copy — to be localised later. */}
      <section className="section_testimonial">
        <div className="padding-global">
          <div className="w-layout-blockcontainer container-large w-container">
            <div className="headline_testimonials-v2" data-w-id="8dd77407-7638-8860-84b4-1292d73f46a7" style={{ opacity: 0, filter: 'blur(5px)' }}>
              <div className="heading_testimonials-v2">
                <div className="master_label" data-wf--tag--variant="base">
                  <div className="label-small">
                    <span {...editText(editable, "aboutPage.testimonial.eyebrow", { maxLength: 80 })}>{dict.aboutPage.testimonial.eyebrow}</span>
                  </div>
                </div>
                <h2 className="margin-0">
                  <span {...editText(editable, "aboutPage.testimonial.title.lead", { maxLength: 80 })}>{dict.aboutPage.testimonial.title}</span>
                  <span className="tone-medium" {...editText(editable, "aboutPage.testimonial.title.accent", { maxLength: 80 })}>
                    {dict.aboutPage.testimonial.titleAccent}
                  </span>
                </h2>
              </div>
            </div>
            <div className="slider w-slider" data-animation="cross" data-autoplay="false" data-autoplay-limit="0" data-delay="4000" data-disable-swipe="false" data-duration="500" data-easing="ease" data-hide-arrows="false" data-infinite="true" data-nav-spacing="3">
              <div className="mask_testimonials-v2 w-slider-mask">
                <div className="slide_testimonials-v2 w-slide">
                  <div className="card_testimonial-v2">
                    <div className="left_testimonial-v2">
                      <div className="quotes_testimonial-v2 w-embed">
                        {/* Decorative quote glyph replaced with the Signex wordmark. Rendered via a CSS
                            mask filled with currentColor, so it picks up the container's faint
                            ink--dark-8 colour exactly like the original quote glyph did. Scoped in globals.css. */}
                        <span className="quotes_testimonial-signex" role="img" aria-label="Signex" />
                      </div>
                      <div className="testimonial-signex_body">
                        {dict.aboutPage.testimonial.body.map((para, i) => (
                          <p key={i} className="text-size-regular margin-0">
                            {para}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="right_testimonial-v2" id="w-node-af30d5d7-8441-26c7-d69a-89a24d922243-4d92222b">
                      {/* testimonial image: configurable AssetRef (aboutPage.testimonial.image); literal fallback */}
                      <img alt={dict.aboutPage.testimonial.imageAlt || "Pexels stephanlouis 19119918"} className="image_cover" loading="lazy" src={dict.aboutPage.testimonial.imageUrl || "/assets/images/69ac691927961ac98c560fe2_pexels-stephanlouis-19119918.avif"} {...editAttrs(editable, "aboutPage.testimonial.image", "image")} />
                      {/* Gradient scrim kept (height:100%/inset:0 in Caladan CSS renders the full
                          gradient even when empty); the Daniel Novak / Adventure Seeker name was removed. */}
                      <div className="overlay_image-testimonial-v2" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="hide w-slider-nav w-round w-num">
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* "About SIGNEX" intro + the 3 manufacturing-approach cards as ONE grouped block (intro on top,
          cards in a row below). Inlined into a single section so the only gap is the headline's
          margin-bottom. The intro headline reveals via the home-c a-124 id 6a32e52a (registered under
          /about's data-wf-page). The cards reuse signex's existing card aesthetic (the stat tiles'
          light-gray surface + the MVV is-vision blue icon tint) via scoped .about-values_* in
          globals.css; content is dict-driven EN+VI (aboutPage.approach), icons by index. */}
      <section className="section_home-about">
        <div className="padding-global">
          <div className="w-layout-blockcontainer container-large w-container">
            <div className="headline_home-about" data-w-id="6a32e52a-664f-8b1c-94cf-2d1d90c61659" style={{ opacity: 0, filter: 'blur(5px)' }}>
              <div className="master_label" data-wf--tag--variant="base">
                <div className="label-small">
                  <span {...editText(editable, "aboutPage.intro.eyebrow", { maxLength: 80 })}>{dict.aboutPage.intro.eyebrow}</span>
                </div>
              </div>
              <h2 className="margin-0">
                <span {...editText(editable, "aboutPage.intro.title.lead", { maxLength: 80 })}>{dict.aboutPage.intro.title}</span>
                <span className="tone-medium" {...editText(editable, "aboutPage.intro.title.accent", { maxLength: 80 })}>
                  {dict.aboutPage.intro.titleAccent}
                </span>
              </h2>
              <div className="home_about-p">
                <p className="tone-medium">
                  <span {...editText(editable, "aboutPage.intro.body", { maxLength: 200 })}>{dict.aboutPage.intro.body}</span>
                </p>
              </div>
            </div>
            <div className="about-values_grid">
              {dict.aboutPage.approach.map((c, i) => (
                <div className="about-values_card" key={c.title}>
                  <div className="about-values_icon w-embed">
                    {APPROACH_ICONS[i]}
                  </div>
                  <h3 className="about-values_title">
                    {c.title}
                  </h3>
                  {c.body.map((para, j) => (
                    <p className="tone-medium about-values_body" key={j}>
                      {para}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      {/* "Manufacturing Capability" — standard signex header (eyebrow + tone-split h2 + description,
          reveals via the shared home-c a-124 id 6a32e52a) + 3 cards (Core Products / Materials /
          Production Strengths) reusing the .about-values_* card aesthetic, each a bulleted list, plus
          a centered closing note. No ref section matched this layout (header + per-card bullet lists),
          so it's a custom build using signex's existing colours/type. dict-driven EN+VI. */}
      <section className="section_home-about">
        <div className="padding-global">
          <div className="w-layout-blockcontainer container-large w-container">
            <div className="headline_home-about" data-w-id="6a32e52a-664f-8b1c-94cf-2d1d90c61659" style={{ opacity: 0, filter: 'blur(5px)' }}>
              <div className="master_label" data-wf--tag--variant="base">
                <div className="label-small">
                  <span {...editText(editable, "aboutPage.capability.eyebrow", { maxLength: 80 })}>{dict.aboutPage.capability.eyebrow}</span>
                </div>
              </div>
              <h2 className="margin-0">
                <span {...editText(editable, "aboutPage.capability.title.lead", { maxLength: 80 })}>{dict.aboutPage.capability.title}</span>
                <span className="tone-medium" {...editText(editable, "aboutPage.capability.title.accent", { maxLength: 80 })}>
                  {dict.aboutPage.capability.titleAccent}
                </span>
              </h2>
              <div className="home_about-p">
                <p className="tone-medium">
                  <span {...editText(editable, "aboutPage.capability.body", { maxLength: 200 })}>{dict.aboutPage.capability.body}</span>
                </p>
              </div>
            </div>
            <div className="about-values_grid">
              {dict.aboutPage.capability.groups.map((g) => (
                <div className="about-values_card" key={g.title}>
                  <h3 className="about-values_title">
                    {g.title}
                  </h3>
                  <ul className="about-cap_list" role="list">
                    {g.items.map((item) => (
                      <li className="about-cap_item tone-medium" key={item}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="about-cap_closing">
              {dict.aboutPage.capability.closing.map((line) => (
                <p className="tone-medium" key={line}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>
      {/* "Manufacturing Approach" — 4-step process (Image #47), same approach as the other /about
          sections: standard header (eyebrow + tone-split h2 + description, reveals via shared home-c
          a-124 id 6a32e52a) + 4 centered cards, each a numbered badge (1–4) + title + description.
          Reuses signex's light-gray card surface + accent blue (#4956e3) for the number badge.
          Custom scoped .about-steps_* in globals.css; dict-driven EN+VI (aboutPage.process). */}
      <section className="section_home-about">
        <div className="padding-global">
          <div className="w-layout-blockcontainer container-large w-container">
            <div className="headline_home-about" data-w-id="6a32e52a-664f-8b1c-94cf-2d1d90c61659" style={{ opacity: 0, filter: 'blur(5px)' }}>
              <div className="master_label" data-wf--tag--variant="base">
                <div className="label-small">
                  <span {...editText(editable, "aboutPage.process.eyebrow", { maxLength: 80 })}>{dict.aboutPage.process.eyebrow}</span>
                </div>
              </div>
              <h2 className="margin-0">
                <span {...editText(editable, "aboutPage.process.title.lead", { maxLength: 80 })}>{dict.aboutPage.process.title}</span>
                <span className="tone-medium" {...editText(editable, "aboutPage.process.title.accent", { maxLength: 80 })}>
                  {dict.aboutPage.process.titleAccent}
                </span>
              </h2>
              <div className="home_about-p">
                <p className="tone-medium">
                  <span {...editText(editable, "aboutPage.process.body", { maxLength: 200 })}>{dict.aboutPage.process.body}</span>
                </p>
              </div>
            </div>
            <div className="about-steps_grid">
              {dict.aboutPage.process.steps.map((s, i) => (
                <div className="about-steps_card" key={s.title}>
                  <div className="about-steps_num">
                    {i + 1}
                  </div>
                  <h3 className="about-steps_title">
                    {s.title}
                  </h3>
                  <p className="about-steps_body tone-medium">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      {/* "Our Journey" timeline — ported from signex-web-ref's /about (section_timeline). The vertical
          progress line is pure CSS (.timeline_progress-line is position:sticky, not IX2), so it works
          un-gated; only the header reveal was page-gated and is re-pointed to the home-c a-124 id
          6a32e52a (header reuses .headline_home-about for the eyebrow + reveal, like the other /about
          sections). Rows alternate item left/right by index; on ≤767px the .timeline_empty hides and
          even rows' circle is re-ordered to the front via a scoped nth-child rule (replacing Caladan's
          per-node w-node ids). dict-driven EN+VI; milestones are SIGNEX-themed placeholders. */}
      <section className="section_timeline">
        <div className="padding-global">
          <div className="w-layout-blockcontainer container-large w-container">
            <div className="headline_home-about" data-w-id="6a32e52a-664f-8b1c-94cf-2d1d90c61659" style={{ opacity: 0, filter: 'blur(5px)' }}>
              <div className="master_label" data-wf--tag--variant="base">
                <div className="label-small">
                  <span {...editText(editable, "aboutPage.timeline.eyebrow", { maxLength: 80 })}>{dict.aboutPage.timeline.eyebrow}</span>
                </div>
              </div>
              <h2 className="margin-0">
                <span {...editText(editable, "aboutPage.timeline.title.lead", { maxLength: 80 })}>{dict.aboutPage.timeline.title}</span>
                <span className="tone-medium" {...editText(editable, "aboutPage.timeline.title.accent", { maxLength: 80 })}>
                  {dict.aboutPage.timeline.titleAccent}
                </span>
              </h2>
              <div className="home_about-p">
                <p className="tone-medium">
                  <span {...editText(editable, "aboutPage.timeline.body", { maxLength: 200 })}>{dict.aboutPage.timeline.body}</span>
                </p>
              </div>
            </div>
            <div className="about-process_intro">
              {dict.aboutPage.timeline.intro.map((line, i) => (
                <p className="tone-medium" key={i}>
                  {line}
                </p>
              ))}
            </div>
            <div className="timeline">
              <div className="content_timeline">
                <div className="timeline_progress">
                  <div className="timeline_fade-top" />
                  <div className="timeline_progress-line" />
                  <div className="timeline-line" />
                  <div className="timeline_fade-bottom" />
                </div>
                <div className="timeline_list">
                  {dict.aboutPage.timeline.milestones.map((m, i) => {
                    const card = (
                      <div className="item_timeline">
                        <div className="title_timeline-card">
                          <h3 className="heading-style-h4 margin-0">
                            {m.title}
                          </h3>
                          <div className="label-large">
                            {m.num}
                          </div>
                        </div>
                        <p className="tone-medium">
                          {m.body}
                        </p>
                        {m.items && (
                          <ul className="about-cap_list" role="list">
                            {m.items.map((it) => (
                              <li className="about-cap_item tone-medium" key={it}>
                                {it}
                              </li>
                            ))}
                          </ul>
                        )}
                        {m.note && (
                          <p className="tone-medium">
                            {m.note}
                          </p>
                        )}
                      </div>
                    );
                    const circle = (
                      <div className="wrap_circle-timeline">
                        <div className="circle-timeline" />
                      </div>
                    );
                    const empty = <div className="timeline_empty" />;
                    return (
                      <div className="timeline_row" key={m.num + m.title}>
                        {i % 2 === 0 ? (
                          <>{empty}{circle}{card}</>
                        ) : (
                          <>{card}{circle}{empty}</>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
