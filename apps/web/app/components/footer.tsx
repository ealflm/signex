// app/components/footer.tsx
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";

/**
 * Footer — signex content poured into Caladan's master_footer shell. The shell
 * (master_footer / padding-global / container-large / the giant SIGNEX wordmark /
 * decorative corner watermark / progressive_blur) is kept; only the CONTENT of footer_top-tile
 * (now 3 columns: brand + socials | Contact us | Quick links) and footer_mid-tile
 * (now a shipping | payment utility row) is signex's, dict-driven (EN + VI).
 *
 * Design fidelity: the text uses the footer's own atoms (text_body-bold, tone-medium,
 * link_footer, text-size-*), which inherit master_footer's dark-context tone remap
 * (tone--strong → white, tone--medium → light-64), so colours match the rest of the
 * footer automatically. Only the LAYOUT grid and the brand chips/badges (Facebook,
 * YouTube, Lalamove, Grab, payment networks — brand colours not in Caladan's palette,
 * hard-coded like the contact-section icon chips) are scoped in globals.css.
 *
 * The field labels (Email:/Tel:/Zalo:/Tax:/Office:/Factory:) are identical in both
 * locales' mockups, so they live here, not in the dictionary. The middle payment badge
 * differs by locale (JCB in EN, COD in VI) — that comes from dict.payments verbatim.
 */

// Facebook "f" + YouTube glyphs (white, on the brand-coloured chips). aria-hidden — the
// link's aria-label names them. currentColor so the chip's `color` drives the glyph.
const FACEBOOK_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 13.5h2.5l1-4H14v-2c0-1.03 0-2 2-2h1.5V2.14c-.326-.043-1.557-.14-2.857-.14C11.928 2 10 3.657 10 6.7v2.8H7v4h3V22h4v-8.5z" />
  </svg>
);
const YOUTUBE_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M21.582 7.186a2.506 2.506 0 0 0-1.768-1.768C18.254 5 12 5 12 5s-6.254 0-7.814.418c-.86.23-1.538.908-1.768 1.768C2 8.746 2 12 2 12s0 3.254.418 4.814c.23.86.908 1.538 1.768 1.768C5.746 19 12 19 12 19s6.254 0 7.814-.418a2.506 2.506 0 0 0 1.768-1.768C22 15.254 22 12 22 12s0-3.254-.418-4.814zM10 15V9l5.196 3L10 15z" />
  </svg>
);

// Payment-badge text tone (white badge, coloured label): VISA/Napas blue, JCB/COD red.
const PAY_TONE: Record<string, string> = { JCB: "is-red", COD: "is-red" };

// Courier-badge modifier from the brand name: "Lalamove" → "is-lalamove", "Grab" → "is-grab"
// (so the scoped brand-colour rules in globals.css still apply). A renamed/new courier just
// gets a slug with no special colour — it falls back to the default badge surface.
const badgeSlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function Footer({ dict, editable = false }: { dict: Dictionary["footer"]; editable?: boolean }) {
  const t = dict;

  return (
    <section className="footer" data-sx-block="footer">
      {/* roles is ["bg"] only, and that is correct: .master_footer's glyph bearers re-declare a
          translucent colour, so a `text` override on this block would not reach them. No `token`:
          the old `baseDark` was false — .master_footer paints
          background-color: var(--_🎨-color--base---accent--deep-navy) i.e. the accentDeepNavy
          SEED. (The base--dark-100 nearby is a re-declaration of the ink--base token for
          descendants, not this element's own background — likely what the wrong token was read off.)
          Declaring nothing beats declaring a lie; the colour engine resolves seeds as well as
          tokens, so it will answer this one once wired in. */}
      <div className="master_footer" {...editableAttrs(editable, "footer.bar.color", { color: { roles: ["bg"] } })}>
        <div className="padding-global">
          <div className="w-layout-blockcontainer container-large w-container">
            <div className="footer_top-tile footer-signex_top">
              {/* Column 1 — brand. Top label "SIGNEX" using the same label-large heading
                  as the other two columns (brand name is locale-invariant, so it's hard-coded
                  like the field labels), then brand name, taglines, socials. */}
              <div className="footer-signex_col">
                {/* Signex logo (replaces the "SIGNEX" text label). Same user SVG as the
                    navbar, but rendered white (brightness(0) invert(1)) so it reads on the
                    dark footer like the wordmark/lotus do. */}
                <img alt="Signex" className="footer-signex_logo" loading="lazy" src={t.logoUrl || "/assets/images/signex-logo.svg"} {...editableAttrs(editable, "footer.logo", { image: true })} />
                <div className="footer-signex_brand">
                  <div className="text-size-regular text_body-bold">
                    {/* Brand line "<brand> – <suffix>": only the suffix is editable, rendered as its
                        own (unconditional, inert-on-public) span; the "<brand> – " prefix stays plain. */}
                    {t.brandPrefix}<span {...editableAttrs(editable, "footer.brandSuffix", { text: { maxLength: 80 } })}>{t.brandSuffix}</span>
                  </div>
                  <div className="footer-signex_tagline text-size-small tone-medium">
                    {t.tagline.map((line, i) => (
                      <div key={i}>
                        <span {...editableAttrs(editable, `footer.tagline.${i}`, { text: { maxLength: 120 } })}>{line}</span>
                      </div>
                    ))}
                  </div>
                  <div className="footer-signex_socials">
                    <a className="footer-signex_social is-facebook" href={t.social.facebook} aria-label="Facebook">
                      {FACEBOOK_ICON}
                    </a>
                    <a className="footer-signex_social is-youtube" href={t.social.youtube} aria-label="YouTube">
                      {YOUTUBE_ICON}
                    </a>
                  </div>
                </div>
              </div>

              {/* Column 2 — Contact us. Heading uses the original Caladan footer
                  link-column label style (label-large: uppercase, muted, letter-spaced),
                  matching the Quick links column. */}
              <div className="footer-signex_col">
                <div className="label-large tone-medium">
                  <span {...editableAttrs(editable, "footer.contactHeading", { text: { maxLength: 80 } })}>{t.contactHeading}</span>
                </div>
                <div className="footer-signex_contact">
                  {/* Field labels (Email:/Tel:/…) stay literal by design (locale-invariant); only the
                      VALUES are stamped, so each NAP value is click-to-edit (routes to Business contact).
                      Labels themselves remain editable in the Business contact panel. */}
                  <div className="text-size-small text_body-bold footer-signex_company">
                    <span {...editableAttrs(editable, t.nap.legalName.field, { text: { maxLength: 120 } })}>{t.nap.legalName.text}</span>
                  </div>
                  <div className="text-size-small">
                    <span className="text_body-bold">Email:</span>{" "}
                    <span className="tone-medium" {...editableAttrs(editable, t.nap.email.field, { text: { maxLength: 120 } })}>{t.nap.email.text}</span>
                  </div>
                  {t.nap.tel && (
                    <div className="text-size-small">
                      <span className="text_body-bold">Tel:</span>{" "}
                      <span className="tone-medium" {...editableAttrs(editable, t.nap.tel.value.field, { text: { maxLength: 80 } })}>{t.nap.tel.value.text}</span>
                    </div>
                  )}
                  {t.nap.zalo && (
                    <div className="text-size-small">
                      <span className="text_body-bold">Zalo:</span>{" "}
                      <span className="tone-medium" {...editableAttrs(editable, t.nap.zalo.value.field, { text: { maxLength: 80 } })}>{t.nap.zalo.value.text}</span>
                    </div>
                  )}
                  <div className="text-size-small">
                    <span className="text_body-bold">Tax:</span>{" "}
                    <span className="tone-medium" {...editableAttrs(editable, t.nap.tax.value.field, { text: { maxLength: 80 } })}>{t.nap.tax.value.text}</span>
                  </div>
                  {t.nap.office && (
                    <div className="footer-signex_address">
                      <div className="text-size-small text_body-bold">
                        Office:
                      </div>
                      <div className="text-size-small tone-medium">
                        <span {...editableAttrs(editable, t.nap.office.value.field, { text: { maxLength: 160 } })}>{t.nap.office.value.text}</span>
                      </div>
                    </div>
                  )}
                  {t.nap.factory && (
                    <div className="footer-signex_address">
                      <div className="text-size-small text_body-bold">
                        Factory:
                      </div>
                      <div className="text-size-small tone-medium">
                        <span {...editableAttrs(editable, t.nap.factory.value.field, { text: { maxLength: 160 } })}>{t.nap.factory.value.text}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Column 3 — Quick links. Restyled to the original Caladan footer
                  link-column look (Image 12 "Other pages"): the label-large uppercase
                  muted heading + native column_footer-links spacing, instead of the
                  bold-white heading the brand/contact columns use. */}
              <div className="footer-signex_col">
                <div className="label-large tone-medium">
                  <span {...editableAttrs(editable, "footer.quickHeading", { text: { maxLength: 80 } })}>{t.quickHeading}</span>
                </div>
                <div className="column_footer-links">
                  {t.links.map((l, i) => (
                    <a className="link_footer" href={l.href} key={l.label}>
                      <span {...editableAttrs(editable, `footer.links.${i}.label`, { text: { maxLength: 80 } })}>{l.label}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* Shipping (left) | Payment (right) — repurposed footer_mid-tile */}
            <div className="footer_mid-tile footer-signex_utility">
              <div className="footer-signex_badges">
                <span className="text-size-small tone-medium">
                  <span {...editableAttrs(editable, "footer.shipLabel", { text: { maxLength: 80 } })}>{t.shipLabel}</span>
                </span>
                {t.shipping.map((name, i) => (
                  <span className={`footer-signex_badge is-${badgeSlug(name)}`} key={i}>
                    {name}
                  </span>
                ))}
              </div>
              <div className="footer-signex_badges">
                <span className="text-size-small tone-medium">
                  <span {...editableAttrs(editable, "footer.payLabel", { text: { maxLength: 80 } })}>{t.payLabel}</span>
                </span>
                {t.payments.map((p, i) => (
                  <span className={`footer-signex_badge footer-signex_pay ${PAY_TONE[p] ?? "is-blue"}`} key={i}>
                    {p}
                  </span>
                ))}
              </div>
            </div>

            {/* SIGNEX wordmark (inline SVG <text> in the loaded Interdisplay webfont;
                viewBox scales it to full container width like the original image,
                textLength + lengthAdjust="spacing" force edge-to-edge fill via tracking
                only, keeping the glyph shapes authentic). */}
            <a aria-label="SIGNEX" className="link_footer-logo w-inline-block" href="#">
              <svg className="logo_footer" viewBox="0 0 516 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="SIGNEX" xmlns="http://www.w3.org/2000/svg">
                <text x="258" y="99" textAnchor="middle" textLength="516" lengthAdjust="spacing" fontFamily="Interdisplay, Arial, sans-serif" fontWeight="700" fontSize="134" fill="#ffffff">
                  SIGNEX
                </text>
              </svg>
            </a>
            {/* Decorative lotus watermark (replaces Caladan's palm). Keeps the palm's
                position/size/opacity via .palm-footer; .footer-signex_lotus recolours the
                black source art to a faint white silhouette (brightness(0) invert(1)) so it
                reads on the dark footer like the cream palm did. alt="" — decorative.
                Configurable AssetRef (footer.watermark); falls back to the literal lotus.svg. */}
            <img alt={t.watermarkAlt || ""} className="palm-footer footer-signex_lotus" loading="lazy" src={t.watermarkUrl || "/assets/images/lotus.svg"} {...editableAttrs(editable, "footer.watermark", { image: true })} />
          </div>
        </div>
        <div className="progressive_blur">
          <div className="progressive-blur" style={{ ['--blur']: '3rem', ['--ratio']: '1.9' }}>
            <div className="progressive-blur-panel is-1" style={{ ['--i']: '6' }}>
            </div>
            <div className="progressive-blur-panel is-2" style={{ ['--i']: '5' }}>
            </div>
            <div className="progressive-blur-panel is-3" style={{ ['--i']: '4' }}>
            </div>
            <div className="progressive-blur-panel is-4" style={{ ['--i']: '3' }}>
            </div>
            <div className="progressive-blur-panel is-5" style={{ ['--i']: '2' }}>
            </div>
            <div className="progressive-blur-panel is-6" style={{ ['--i']: '1' }}>
            </div>
            <div className="progressive-blur-panel is-7" style={{ ['--i']: '1' }}>
            </div>
            <div className="progressive-blur-panel is-8" style={{ ['--i']: '1' }}>
            </div>
            <div className="progressive-blur-panel is-9" style={{ ['--i']: '1' }}>
            </div>
            <div className="progressive-blur-panel is-10" style={{ ['--i']: '1' }}>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
