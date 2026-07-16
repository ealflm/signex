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
 * The field labels (Email:/Tel:/Zalo:/Tax:/Office:/Factory:) are CONTENT — they come from
 * businessContact (phones[].label, sites[].label, taxLabel, emailLabel), the same fields the
 * contactPage card reads, so a label edit moves both. They happen to be identical in both
 * locales' seed, but they are LocalizedText and nothing here assumes otherwise. Only the ":"
 * separator is this template's.
 *
 * The badge lists (shipping/payments) are LOCALE-INVARIANT brand names: ONE array in the snapshot,
 * rendered verbatim in both locales. An earlier version of this comment claimed "the middle payment
 * badge differs by locale (JCB in EN, COD in VI)" — that has not been true since the site began
 * reading the CMS snapshot instead of the en/vi dictionaries. `payments` is a single
 * z.array(z.string()), so /vi renders JCB exactly like /en does (measured: no COD element exists on
 * /vi). The vestigial "COD" in dictionaries/vi.json is not a render source. Restoring a per-locale
 * payment list would be a CONTENT decision (and a schema change); this note only stops the comment
 * from describing a behaviour the code does not have.
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

// ─── The badge text DRIVES the badge colour (both lists) ──────────────────────
// Both badge lists are click-to-edit (footer.shipping.<i> / footer.payments.<i>), so a user CAN
// rename one, and the rename decides the colour. The two lists degrade DIFFERENTLY, and the
// difference is measured, not assumed:
//
//   payments — PAY_TONE[p] ?? "is-blue". A miss still lands on a COMPLETE badge style:
//     .footer-signex_pay paints the white surface + border and .is-blue the ink
//     (measured: bg rgb(255,255,255), color rgb(26,31,113)). Renaming VISA → Amex yields a
//     proper blue payment chip. The fallback is genuinely sane; this coupling is left alone.
//
//   shipping — is-${badgeSlug(name)}. A miss lands on NOTHING: .footer-signex_badge declares only
//     box/typography, no background and no colour of its own, so an unknown slug renders as
//     bare white bold text with NO chip (measured: .is-ahamove → background rgba(0,0,0,0), no
//     border). Renaming Lalamove → Ahamove does not "fall back to the default badge surface" —
//     an earlier version of this comment said it did, and no such surface exists in globals.css.
//     Accepted as-is: renaming a courier means changing partner (rare), the text stays legible,
//     and inventing a neutral-chip style is a design decision nobody asked for. If that is ever
//     unwanted, the fix is ONE rule — a background on .footer-signex_badge — which provably
//     cannot disturb today's render, since .footer-signex_badge.is-lalamove/.is-grab both set
//     background-color and outrank it on specificity.
//
// Either way the colour only re-resolves on SAVE + re-render: the inline overlay mutates
// textContent, not className, so a rename keeps the old colour until the draft round-trips.
const PAY_TONE: Record<string, string> = { JCB: "is-red", COD: "is-red" };

// Courier-badge modifier from the brand name: "Lalamove" → "is-lalamove", "Grab" → "is-grab"
// (so the scoped brand-colour rules in globals.css still apply). See the note above for what a
// slug with no matching rule actually renders as.
const badgeSlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function Footer({ dict, editable = false }: { dict: Dictionary["footer"]; editable?: boolean }) {
  const t = dict;

  return (
    <section className="footer" data-sx-block="footer">
      {/* What the colour engine resolves here: .master_footer paints
          background-color: var(--_🎨-color--base---accent--deep-navy) — the accentDeepNavy SEED, not
          a token (the engine resolves both tiers). Its glyph bearers re-declare a translucent colour
          of their own, so `bg` is the only role that reaches anything from this element. (The
          base--dark-100 nearby re-declares the ink--base token for DESCENDANTS; it is not this
          element's own background — reading it as one is how an earlier hand-declared token got this
          wrong, which is why nothing is hand-declared any more. See EditableOpts.color.) */}
      <div className="master_footer" {...editableAttrs(editable, "footer.bar.color", { color: true })}>
        <div className="padding-global">
          <div className="w-layout-blockcontainer container-large w-container">
            <div className="footer_top-tile footer-signex_top">
              {/* Column 1 — brand. Top label "SIGNEX" using the same label-large heading
                  as the other two columns, then brand name, taglines, socials. */}
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
                  {/* Field labels (Email:/Tel:/…) are CONTENT, not literals: businessContact carries
                      phones[].label, sites[].label, taxLabel (all LocalizedText) and the optional
                      emailLabel. Both leaves of each row are stamped on the SAME field paths the
                      contactPage card uses (content.ts builds both from phoneRow/addrRow/taxRow), so
                      editing a label moves it in BOTH places instead of silently diverging.
                      The ":" is TEMPLATE, not content — it stays outside the editable span, exactly
                      as the contactPage card composes it (home/contact.tsx renders label + {": "}).
                      It stays inside the bold wrapper so the colon keeps rendering bold, as before. */}
                  <div className="text-size-small text_body-bold footer-signex_company">
                    <span {...editableAttrs(editable, t.nap.legalName.field, { text: { maxLength: 120 } })}>{t.nap.legalName.text}</span>
                  </div>
                  <div className="text-size-small">
                    <span className="text_body-bold"><span {...editableAttrs(editable, t.nap.email.label.field, { text: { maxLength: 80 } })}>{t.nap.email.label.text}</span>:</span>{" "}
                    <span className="tone-medium" {...editableAttrs(editable, t.nap.email.value.field, { text: { maxLength: 120 } })}>{t.nap.email.value.text}</span>
                  </div>
                  {t.nap.tel && (
                    <div className="text-size-small">
                      <span className="text_body-bold"><span {...editableAttrs(editable, t.nap.tel.label.field, { text: { maxLength: 80 } })}>{t.nap.tel.label.text}</span>:</span>{" "}
                      <span className="tone-medium" {...editableAttrs(editable, t.nap.tel.value.field, { text: { maxLength: 80 } })}>{t.nap.tel.value.text}</span>
                    </div>
                  )}
                  {t.nap.zalo && (
                    <div className="text-size-small">
                      <span className="text_body-bold"><span {...editableAttrs(editable, t.nap.zalo.label.field, { text: { maxLength: 80 } })}>{t.nap.zalo.label.text}</span>:</span>{" "}
                      <span className="tone-medium" {...editableAttrs(editable, t.nap.zalo.value.field, { text: { maxLength: 80 } })}>{t.nap.zalo.value.text}</span>
                    </div>
                  )}
                  <div className="text-size-small">
                    <span className="text_body-bold"><span {...editableAttrs(editable, t.nap.tax.label.field, { text: { maxLength: 80 } })}>{t.nap.tax.label.text}</span>:</span>{" "}
                    <span className="tone-medium" {...editableAttrs(editable, t.nap.tax.value.field, { text: { maxLength: 80 } })}>{t.nap.tax.value.text}</span>
                  </div>
                  {t.nap.office && (
                    <div className="footer-signex_address">
                      <div className="text-size-small text_body-bold">
                        <span {...editableAttrs(editable, t.nap.office.label.field, { text: { maxLength: 80 } })}>{t.nap.office.label.text}</span>:
                      </div>
                      <div className="text-size-small tone-medium">
                        <span {...editableAttrs(editable, t.nap.office.value.field, { text: { maxLength: 160 } })}>{t.nap.office.value.text}</span>
                      </div>
                    </div>
                  )}
                  {t.nap.factory && (
                    <div className="footer-signex_address">
                      <div className="text-size-small text_body-bold">
                        <span {...editableAttrs(editable, t.nap.factory.label.field, { text: { maxLength: 80 } })}>{t.nap.factory.label.text}</span>:
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
                {/* Courier badges are content (footer.shipping), one field path per item — the
                    `footer.links.${i}.label` / `about.mission.items.${i}` convention. The stamp goes
                    on the badge span itself: its text IS its only child, so unlike the NAP labels
                    (which need a nested span to keep the ":" out of the field) nothing here has to
                    be excluded from the editable range. */}
                {t.shipping.map((name, i) => (
                  <span
                    className={`footer-signex_badge is-${badgeSlug(name)}`}
                    key={i}
                    {...editableAttrs(editable, `footer.shipping.${i}`, { text: { maxLength: 40 } })}
                  >
                    {name}
                  </span>
                ))}
              </div>
              <div className="footer-signex_badges">
                <span className="text-size-small tone-medium">
                  <span {...editableAttrs(editable, "footer.payLabel", { text: { maxLength: 80 } })}>{t.payLabel}</span>
                </span>
                {/* Payment badges — same convention. Locale-invariant, so editing one on the /vi
                    canvas changes /en too; that is what a single z.array(z.string()) MEANS here,
                    not an oversight. */}
                {t.payments.map((p, i) => (
                  <span
                    className={`footer-signex_badge footer-signex_pay ${PAY_TONE[p] ?? "is-blue"}`}
                    key={i}
                    {...editableAttrs(editable, `footer.payments.${i}`, { text: { maxLength: 40 } })}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>

            {/* The giant brand wordmark (inline SVG <text> in the loaded Interdisplay webfont;
                viewBox scales it to full container width like the original image,
                textLength + lengthAdjust="spacing" force edge-to-edge fill via tracking
                only, keeping the glyph shapes authentic).

                TEXT: businessContact.brand, not a literal — the same field the brand line's prefix
                reads (content.ts resolves it once). Editable in the admin's "Business contact"
                section panel. It is NOT click-to-edit, and that is a browser fact rather than a
                policy: the inline engine works by setting `el.contentEditable = "true"`, and
                `"contentEditable" in <text>` is FALSE — SVGElement does not implement the
                ElementContentEditable mixin, so the assignment silently creates an expando, sets no
                attribute, and Chrome refuses the element as an editing host (measured:
                isContentEditable undefined, matches(":read-write") false, focus() no-op — against an
                HTML <span> in this same footer where all three succeed). Editing it inline needs
                HTML text, and HTML cannot reproduce `textLength` — see the note below.

                ⚠️ THE WORDMARK IS TUNED FOR A 6-CHARACTER BRAND, and `textLength` makes that a
                LEGIBILITY limit, not a layout one. lengthAdjust="spacing" forces the string's advance
                to exactly 516 user units whatever it says, so the BOX never moves (measured at 40
                chars: ink 530.79 units vs 516 — ±7.4 units, no reflow, nothing overflows). What
                moves is the tracking, and it goes negative past 6 glyphs (measured per inter-glyph
                gap at fontSize 134: "SIGNE" +29.2 · "SIGNEX" +4.6 ← today, essentially natural ·
                7 chars −11.7 (glyphs overlap 14%) · 10 chars −38.9 (45%) · "SIGNEX GROUP" −42.7
                (52% — an illegible smear). So renaming the brand to anything longer than ~6
                characters smears this wordmark while the small brand line above reflows fine.
                NOT guarded here: the alternatives all change today's render (dropping textLength and
                re-tuning fontSize to 140.3 fills the box naturally but alters the tracking the
                acceptance test pins), and clamping someone's brand name is a product decision nobody
                asked for. The honest trade is recorded instead: before this comment existed the
                wordmark simply showed the WRONG name after a rename, which is worse than showing the
                right one badly.

                FILL: `currentColor`, not `#ffffff` — and this is a BUG FIX, not a hook. The computed
                `color` at this <text> is ALREADY exactly rgb(255,255,255) (inherited from
                master_footer's dark-context tone remap), so the render is unchanged to the pixel;
                what changes is that the colour panel stops LYING. The engine's painterFor collects
                "ink bearers" as (elements owning a text node) ∪ (marks whose paint follows `color`).
                An SVG <text> owns a text node, so it entered as a TEXT bearer and never faced
                paintFollowsColor at all — the `fill="#ffffff"` exclusion that ink-paint.ts's own
                comment promises was reached through the other door. The click therefore reported a
                `text` role, hex #ffffff, with a unique per-element selector, and applying that
                override moved the <a>'s color to magenta and left the glyph white (measured
                before/after/restored). A control that paints nothing — the same species as
                19102d2's accentAqua. With `currentColor` the reported hex is one the glyph really
                has, and the override really repaints it.

                No `data-sx-c` anchor: the engine's generated structural selector already resolves
                this element uniquely (selectorMatches: 1, matchesTheAnchor: true), and an anchor is
                emitted on the PUBLIC render too — so adding one would change public bytes to buy
                stability nothing has measured a need for. */}
            <a aria-label={t.brand} className="link_footer-logo w-inline-block" href="#">
              <svg className="logo_footer" viewBox="0 0 516 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label={t.brand} xmlns="http://www.w3.org/2000/svg">
                <text x="258" y="99" textAnchor="middle" textLength="516" lengthAdjust="spacing" fontFamily="Interdisplay, Arial, sans-serif" fontWeight="700" fontSize="134" fill="currentColor">{t.brand}</text>
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
