import type { Dictionary } from "@/app/[lang]/dictionaries";
import { StaticWebflowForm } from "@/app/components/static-webflow-form";
import { LeadUploadField } from "@/app/components/lead-upload-field";
import { editText } from "@/app/lib/edit-attrs";

// Card title leaf keys, index-aligned with dict.contact.cards (Email / Phone / Address). Used to
// stamp each card title with `contactPage.cardLabels.<key>` for the visual editor.
const CARD_KEYS = ["email", "phone", "address"] as const;

// Info-card icons (lucide) + per-card chip tone, index-aligned with dict.contact.cards
// (Email / Phone / Address). Icons aren't translated, so they live here, not in the dict.
const CARD_ICONS = [
  // mail
  <svg key="mail" fill="none" height="100%" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" /><rect height="16" rx="2" width="20" x="2" y="4" /></svg>,
  // phone
  <svg key="phone" fill="none" height="100%" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" /></svg>,
  // map-pin
  <svg key="map-pin" fill="none" height="100%" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></svg>,
];
const CARD_TONE = ["is-email", "is-phone", "is-address"];

/**
 * Contact — home-page contact section. The SHELL is a faithful port of Caladan's
 * `section_hero-contact-b` (signex-web-ref/app/contact/contact-b/page.tsx): section,
 * heading block and `.form.is-v2` card are the ref's markup/classes verbatim. The
 * heading copy is signex's, dict-driven from `dict.contact` (eyebrow + two-tone
 * title + subtitle, EN + VI).
 * The FORM CONTENT mirrors the hero quote form (section_hero-home-a): the same
 * dict-driven fields — Name/Email/Phone (required), Quantity, Standard, Height/Width/
 * Thickness, Upload Sample, Message — sharing the hero's `dict.form` labels,
 * placeholders, submit text, and success message (EN + VI), with the same data-names
 * and standardOptions labels so submissions are shaped identically. Fields sit in a 2-column
 * grid (the three mm dimensions share one 3-up row; Message spans full width) inside a
 * widened card — scoped `contact-form_*` styles in globals.css; the heading keeps the
 * ref's 8-column width in its own `.master_contact-b`, so the section uses two wrappers
 * like the ref page does. `contact-*` ids keep fields unique from the hero's `quote-*`.
 *
 * - The section is LIGHT: `.section_hero-contact-b`'s `ink--base` bg resolves to
 *   `base--light-100`; dark text via `tone--strong`. Coherent with the rest of the home page.
 * - In the ref it's a page hero (large top padding); mid-page that gap is too big, so
 *   globals.css tightens it — same precedent as `.section_hero-resorts` (see globals.css).
 * - The ref's <h1> is demoted to <h2 className="heading-style-h1"> (identical h1
 *   typography) so the home hero keeps the only h1 — same as ProductCategories (b25a69c).
 * - Cross-page IX2 reveal re-point (clone-playbook §1): the ref wrappers' data-w-ids
 *   (ad1a3029-…eb1b headline, 00bd40ee-…d5b7 form-block) are registered only for the
 *   /contact-b page, so on the home page they'd stay `opacity:0; blur(5px)` forever. Both
 *   are re-pointed to the home-page reveal trigger `0f29df12-…d663` (standard a-124:
 *   opacity + unblur on self), shared safely with Features/ProductCategories/HomeAbout.
 * - The section's ref data-w-id (ad1a3029-…eb18) is DROPPED — it already lives on the
 *   product-categories section on this page.
 */
export function Contact({
  dict,
  headlineWid = "0f29df12-8c38-da6f-794d-3989ac10d663",
  gridWid = "b3ac1ddc-636d-f345-c58d-b372a067ce8d",
  formWid = "0f29df12-8c38-da6f-794d-3989ac10d663",
  showCards = true,
  editable = false,
}: {
  dict: Dictionary;
  headlineWid?: string;
  gridWid?: string;
  formWid?: string;
  // The Email/Phone/Address info cards. Default on (home page); /contact passes false because
  // those cards already appear in its contact-c hero above this section (avoid duplicates).
  showCards?: boolean;
  // Visual-editor mode: stamps the eyebrow + card-title leaves. Public render leaves them inert.
  editable?: boolean;
}) {
  // Reveal ids default to the home-page a-124 triggers; overridable so this section can be reused
  // on a page with a different data-wf-page (e.g. /contact uses the contact-c page id — see
  // app/[lang]/contact/page.tsx). IX2 filters reveals by data-wf-page (clone-playbook §1).
  const c = dict.contact;
  const t = dict.form;

  return (
    <section className="section_hero-contact-b" data-sx-block="contactPage">
      <div className="padding-global">
        <div className="w-layout-blockcontainer container-large w-container">
          <div className="master_contact-b">
            <div className="headline_contact-b" data-w-id={headlineWid} style={{ opacity: 0, filter: 'blur(5px)' }}>
              <div className="heading_contact-b">
                <div className="master_label" data-wf--tag--variant="base">
                  <div className="label-small">
                    <span {...editText(editable, "contactPage.eyebrow", { maxLength: 80 })}>{c.eyebrow}</span>
                  </div>
                </div>
                {/* Ref uses <h1> (contact-b is that page's hero); rendered as <h2> so the
                    home hero keeps the only h1. Sized with the bare-h2 typography (margin-0),
                    matching the About / Products headlines (size--h2) so the section headings
                    are visually consistent across the home page. */}
                <h2 className="margin-0">
                  <span {...editText(editable, "contactPage.hero.title.lead", { maxLength: 80 })}>{c.title}</span>
                  <span className="tone-medium" {...editText(editable, "contactPage.hero.title.accent", { maxLength: 80 })}>
                    {c.titleAccent}
                  </span>
                </h2>
              </div>
              <p className="tone-medium">
                <span {...editText(editable, "contactPage.hero.subtitle", { maxLength: 200 })}>{c.subtitle}</span>
              </p>
            </div>
          </div>
          {/* Email / Phone / Address info cards — dict-driven, between heading and form.
              Reveal reuses the home-page grid trigger b3ac1ddc-…ce8d (a-124 on self),
              same as ProductCategories/HomeAbout grids; scoped styles in globals.css.
              Hidden on /contact (showCards=false) — that page already shows these cards in
              its contact-c hero above this section. */}
          {showCards && (
            <div className="contact_info-grid" data-w-id={gridWid} style={{ opacity: 0, filter: 'blur(5px)' }}>
              {c.cards.map((card, i) => (
                <div className="contact_info-card" key={card.title}>
                  <div className={`contact_info-icon ${CARD_TONE[i]} w-embed`}>
                    {CARD_ICONS[i]}
                  </div>
                  <div>
                    <div className="text_body-bold">
                      <span {...editText(editable, `contactPage.cardLabels.${CARD_KEYS[i]}`, { maxLength: 40 })}>{card.title}</span>
                    </div>
                    <div className="contact_info-lines tone-medium">
                      {card.rows.map((row, j) => (
                        <div key={j}>
                          {row.label && (
                            <>
                              <span {...editText(editable, row.label.field, { maxLength: 80 })}>{row.label.text}</span>
                              {": "}
                            </>
                          )}
                          <span {...editText(editable, row.value.field, { maxLength: 160 })}>{row.value.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="master_contact-b contact-form_wide">
            <div className="form-block" data-w-id={formWid} style={{ opacity: 0, filter: 'blur(5px)' }}>
              <StaticWebflowForm
                id="contact-form"
                name="contact-form"
                className="form is-v2"
                formKey="contact"
                successText={t.success}
                failText={t.fail}
              >
                <div className="account_form-inner">
                  {/* 2-col field grid (scoped contact-form_grid overrides the ref's
                      single flex column): Name|Email, Phone|Quantity, Standard|Upload,
                      then the three mm dimensions share one full-width 3-up row and
                      Message spans both columns. Single column under 768px. */}
                  <div className="profile-form_inner contact-form_grid">
                    <div className="input_wrap">
                      <label className="text_input-label label-large" htmlFor="contact-name">
                        <span {...editText(editable, "formConfig.fields.name.label", { maxLength: 80 })}>{t.name}</span>
                        <sup>*</sup>
                      </label>
                      <input className="text-field w-input" data-name="Name" id="contact-name" maxLength={256} name="Name" placeholder={t.namePlaceholder} required type="text" />
                    </div>
                    <div className="input_wrap">
                      <label className="text_input-label label-large" htmlFor="contact-email">
                        <span {...editText(editable, "formConfig.fields.email.label", { maxLength: 80 })}>{t.email}</span>
                        <sup>*</sup>
                      </label>
                      <input className="text-field w-input" data-name="Email" id="contact-email" maxLength={256} name="Email" placeholder={t.emailPlaceholder} required type="email" />
                    </div>
                    <div className="input_wrap">
                      <label className="text_input-label label-large" htmlFor="contact-phone">
                        <span {...editText(editable, "formConfig.fields.phone.label", { maxLength: 80 })}>{t.phone}</span>
                        <sup>*</sup>
                      </label>
                      <input className="text-field w-input" data-name="Phone" id="contact-phone" maxLength={256} name="Phone" placeholder={t.phonePlaceholder} required type="tel" />
                    </div>
                    <div className="input_wrap">
                      <label className="text_input-label label-large" htmlFor="contact-quantity">
                        <span {...editText(editable, "formConfig.fields.quantity.label", { maxLength: 80 })}>{t.quantity}</span>
                      </label>
                      <input className="text-field w-input" data-name="Quantity" id="contact-quantity" name="Quantity" placeholder={t.quantityPlaceholder} type="text" />
                    </div>
                    <div className="input_wrap">
                      <label className="text_input-label label-large" htmlFor="contact-standard">
                        <span {...editText(editable, "formConfig.fields.standard.label", { maxLength: 80 })}>{t.standard}</span>
                      </label>
                      <select className="text-field select w-select" data-name="Standard" defaultValue="" id="contact-standard" name="Standard">
                        <option value="">
                          {t.standardPlaceholder}
                        </option>
                        {t.standardOptions.map((label) => (
                          <option key={label} value={label}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="input_wrap">
                      <label className="text_input-label label-large" htmlFor="contact-sample">
                        <span {...editText(editable, "formConfig.fields.upload.label", { maxLength: 80 })}>{t.upload}</span>
                      </label>
                      {/* Dashed dropzone when empty; a thumbnail/file chip with
                          change + remove once a file is picked. */}
                      <LeadUploadField
                        variant="contact"
                        id="contact-sample"
                        name="Sample"
                        accept="image/*,application/pdf"
                        hint={t.uploadHelp}
                        hintEditAttrs={editText(editable, "formConfig.uploadHelp", { maxLength: 80 })}
                      />
                    </div>
                    <div className="contact-form_dims">
                      <div className="input_wrap">
                        <label className="text_input-label label-large" htmlFor="contact-height">
                          <span {...editText(editable, "formConfig.fields.height.label", { maxLength: 80 })}>{t.height}</span>
                        </label>
                        <input className="text-field w-input" data-name="Height" id="contact-height" inputMode="decimal" name="Height" placeholder={t.heightPlaceholder} type="text" />
                      </div>
                      <div className="input_wrap">
                        <label className="text_input-label label-large" htmlFor="contact-width">
                          <span {...editText(editable, "formConfig.fields.width.label", { maxLength: 80 })}>{t.width}</span>
                        </label>
                        <input className="text-field w-input" data-name="Width" id="contact-width" inputMode="decimal" name="Width" placeholder={t.widthPlaceholder} type="text" />
                      </div>
                      <div className="input_wrap">
                        <label className="text_input-label label-large" htmlFor="contact-thickness">
                          <span {...editText(editable, "formConfig.fields.thickness.label", { maxLength: 80 })}>{t.thickness}</span>
                        </label>
                        <input className="text-field w-input" data-name="Thickness" id="contact-thickness" inputMode="decimal" name="Thickness" placeholder={t.thicknessPlaceholder} type="text" />
                      </div>
                    </div>
                    <div className="input_wrap contact-form_full">
                      <label className="text_input-label label-large" htmlFor="contact-message">
                        <span {...editText(editable, "formConfig.fields.message.label", { maxLength: 80 })}>{t.message}</span>
                      </label>
                      <textarea className="text-field text-area w-input" data-name="Message" id="contact-message" name="Message" placeholder={t.messagePlaceholder}></textarea>
                    </div>
                  </div>
                  <div button="" className="button_submit-static">
                    <input className="button_submit w-button" data-wait={t.submitting} type="submit" value={t.submit} />
                    <a button="" className="cta_primary w-inline-block" data-cta="contact-quote" data-wf--cta-primary--variant="primary" href="#">
                      <div className="button_text-mask">
                        <div button-text="" className="text-button">
                          <span {...editText(editable, "formConfig.submit", { maxLength: 80 })}>{t.submit}</span>
                        </div>
                      </div>
                      <div button-bg="" className="btn-bg">
                      </div>
                    </a>
                  </div>
                </div>
              </StaticWebflowForm>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
