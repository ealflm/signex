import { HeroQuoteForm } from "@/app/components/home/hero-quote-form";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editAttrs, editText, editColor } from "@/app/lib/edit-attrs";

// Server-rendered per locale, so this never re-renders client-side — a plain object is
// fine (no IX2-reveal clobbering concern; language changes are a full navigation now).
const REVEAL_STYLE: React.CSSProperties = { opacity: 0, filter: "blur(5px)" };

export function Hero({ dict, editable = false }: { dict: Dictionary; editable?: boolean }) {
  const t = dict.hero;

  return (
    <section className="section_hero-home-a">
      <div className="padding-global home-a">
        <div className="w-layout-blockcontainer container-large w-container">
          <div className="wrap_home-a">
            <div className="master_hero-home-a">
              <div className="overlay_hero-home-a">
              </div>
              <div className="content_hero-home-a">
                <div className="headline_home-a" data-w-id="e727a2b9-869a-7dcf-ee76-b8e98292f022" style={REVEAL_STYLE}>
                  <div className="heading_home-a">
                    <h1 className="heading-style-h0">
                      <span {...editText(editable, "hero.titleTop")}>{t.titleTop}</span>
                      <br />
                      <span
                        className="tone-medium"
                        {...editColor(editable, "hero.titleBottom.color", { token: "accentAqua", roles: ["text"] })}
                      >
                        <span {...editText(editable, "hero.titleBottom")}>{t.titleBottom}</span>
                      </span>
                    </h1>
                  </div>
                  <div className="p_hero-home-a">
                    <p className="margin-0 text-size-large">
                      <span {...editText(editable, "hero.subtitle", { maxLength: 200 })}>{t.subtitle}</span>
                    </p>
                  </div>
                </div>
                <HeroQuoteForm
                  dict={dict.form}
                  editable={editable}
                  data-w-id="e727a2b9-869a-7dcf-ee76-b8e98292f02d"
                  style={REVEAL_STYLE}
                />
              </div>
              <div className="image_hero-home-a" data-w-id="e727a2b9-869a-7dcf-ee76-b8e98292f051">
                <img alt={t.imageAlt} className="image_cover is-parallax" loading="lazy" src={t.imageUrl || "/assets/images/69b04fc10fe79a2becaf38a8_Contemporary_Cliffside_House_at_Twilight.avif"} {...editAttrs(editable, "hero.image", "image")} />
                <div className="overlay_home-b-hero">
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
