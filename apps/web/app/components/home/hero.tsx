import { HeroQuoteForm } from "@/app/components/home/hero-quote-form";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";

// Server-rendered per locale, so this never re-renders client-side — a plain object is
// fine (no IX2-reveal clobbering concern; language changes are a full navigation now).
const REVEAL_STYLE: React.CSSProperties = { opacity: 0, filter: "blur(5px)" };

export function Hero({ dict, editable = false }: { dict: Dictionary; editable?: boolean }) {
  const t = dict.hero;

  return (
    <section className="section_hero-home-a" data-sx-block="hero">
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
                      <span {...editableAttrs(editable, "hero.titleTop", { text: {} })}>{t.titleTop}</span>
                      <br />
                      {/* One element, two capabilities. The inner CSS-inert span that used to carry
                          the text stamp is gone: .tone-medium (which paints the colour) now carries
                          both. Collapsing is appearance-neutral — colour inherits, so the glyphs
                          render identically with one fewer wrapper. */}
                      <span
                        className="tone-medium"
                        {...editableAttrs(editable, "hero.titleBottom", {
                          text: { maxLength: 80 },
                          // No `token`: .tone-medium reads --_🎨-color--tokens---tone--medium, which
                          // is in neither TOKEN_VARS nor PALETTE_VARS (it derives from base--*-64).
                          // The old `token: "accentAqua"` was simply false. detectToken() reads the
                          // winning rule at click time and answers honestly.
                          color: { roles: ["text"] },
                        })}
                      >
                        {t.titleBottom}
                      </span>
                    </h1>
                  </div>
                  <div className="p_hero-home-a">
                    <p className="margin-0 text-size-large">
                      <span {...editableAttrs(editable, "hero.subtitle", { text: { maxLength: 200 } })}>{t.subtitle}</span>
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
                <img alt={t.imageAlt} className="image_cover is-parallax" loading="lazy" src={t.imageUrl || "/assets/images/69b04fc10fe79a2becaf38a8_Contemporary_Cliffside_House_at_Twilight.avif"} {...editableAttrs(editable, "hero.image", { image: true })} />
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
