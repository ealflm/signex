import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editText } from "@/app/lib/edit-attrs";

/**
 * HomeAbout — Caladan's "section_home-about" (an eyebrow + headline + paragraph), ported
 * from the ref's `homepage/home-c` page onto the home page, placed directly below
 * ProductCategories ("section_hero-resorts"). The original six-image collage
 * (.grid_about-images) is REPLACED with signex's Mission / Vision / Values block:
 * mission statement + checklist on the left, Vision / Values tint cards stacked on the
 * right (scoped `about-mvv_*` styles live in globals.css). Dict-driven Server Component
 * (EN + VI), like Features/ProductCategories.
 *
 * IX2 cross-page gating (see clone-playbook §1):
 *   • The headline reveal wrapper's data-w-id was `6a32e52a-…c61659`, a home-c trigger —
 *     inert on the home page, so the headline would stay `opacity:0; blur(5px)` forever.
 *     RE-POINTED to the home-page reveal trigger `0f29df12-…d663` (standard a-124:
 *     opacity + unblur on self), shared safely with Features/ProductCategories headlines.
 *   • The MVV grid reuses `b3ac1ddc-…ce8d` — the same home reveal trigger (a-124 on self)
 *     already shared by the ProductCategories grid — so the block fades/unblurs in on
 *     scroll like every other home section.
 *
 * `headlineWid`/`gridWid` default to those home-page triggers. They're overridable so the
 * SAME section can be reused on another page whose `data-wf-page` registers different
 * interaction ids (e.g. /about uses the home-c page id — see app/[lang]/about/page.tsx).
 * `showMvv` (default true) renders the Mission/Vision/Values grid; /about passes false to
 * show only the eyebrow + "About SIGNEX" heading + intro paragraph.
 */
export function HomeAbout({
  dict,
  editable = false,
  headlineWid = "0f29df12-8c38-da6f-794d-3989ac10d663",
  gridWid = "b3ac1ddc-636d-f345-c58d-b372a067ce8d",
  showMvv = true,
}: {
  dict: Dictionary["about"];
  editable?: boolean;
  headlineWid?: string;
  gridWid?: string;
  showMvv?: boolean;
}) {
  const t = dict;

  return (
    <section className="section_home-about">
      <div className="padding-global">
        <div className="w-layout-blockcontainer container-large w-container">
          <div className="headline_home-about" data-w-id={headlineWid} style={{ opacity: 0, filter: 'blur(5px)' }}>
            <div className="master_label" data-wf--tag--variant="base">
              <div className="label-small">
                <span {...editText(editable, "about.eyebrow", { maxLength: 80 })}>{t.eyebrow}</span>
              </div>
            </div>
            <h2 className="margin-0">
              <span {...editText(editable, "about.title.lead", { maxLength: 80 })}>{t.title}</span>
              <span className="tone-medium" {...editText(editable, "about.title.accent", { maxLength: 80 })}>
                {t.titleAccent}
              </span>
            </h2>
            <div className="home_about-p">
              <p className="tone-medium">
                <span {...editText(editable, "about.body", { maxLength: 200 })}>{t.body}</span>
              </p>
            </div>
          </div>
          {showMvv && (
          <div className="about-mvv_grid" data-w-id={gridWid} style={{ opacity: 0, filter: 'blur(5px)' }}>
            <div className="about-mvv_mission">
              <h3 className="about-mvv_title">
                <span {...editText(editable, "about.mission.title", { maxLength: 80 })}>{t.mission.title}</span>
              </h3>
              <p className="tone-medium about-mvv_body">
                <span {...editText(editable, "about.mission.body", { maxLength: 200 })}>{t.mission.body}</span>
              </p>
              <ul className="about-mvv_list" role="list">
                {t.mission.items.map((item, i) => (
                  <li className="about-mvv_item" key={i}>
                    <div className="about-mvv_check w-embed">
                      <svg className="lucide lucide-circle-check-icon lucide-circle-check" fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    </div>
                    <div>
                      <span {...editText(editable, `about.mission.items.${i}`, { maxLength: 160 })}>{item}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="about-mvv_cards">
              <div className="about-mvv_card is-vision">
                <div className="about-mvv_card-head">
                  <div className="about-mvv_card-icon w-embed">
                    <svg className="lucide lucide-target-icon lucide-target" fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="12" cy="12" r="6" />
                      <circle cx="12" cy="12" r="2" />
                    </svg>
                  </div>
                  <h3 className="about-mvv_card-title">
                    <span {...editText(editable, "about.vision.title", { maxLength: 80 })}>{t.vision.title}</span>
                  </h3>
                </div>
                <p className="tone-medium about-mvv_body">
                  <span {...editText(editable, "about.vision.body", { maxLength: 200 })}>{t.vision.body}</span>
                </p>
              </div>
              <div className="about-mvv_card is-values">
                <div className="about-mvv_card-head">
                  <div className="about-mvv_card-icon w-embed">
                    <svg className="lucide lucide-award-icon lucide-award" fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
                      <path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" />
                      <circle cx="12" cy="8" r="6" />
                    </svg>
                  </div>
                  <h3 className="about-mvv_card-title">
                    <span {...editText(editable, "about.values.title", { maxLength: 80 })}>{t.values.title}</span>
                  </h3>
                </div>
                <p className="tone-medium about-mvv_body">
                  <span {...editText(editable, "about.values.body", { maxLength: 200 })}>{t.values.body}</span>
                </p>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </section>
  );
}
