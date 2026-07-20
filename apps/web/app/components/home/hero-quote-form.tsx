// app/components/home/hero-quote-form.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";
import { LeadFormNotice } from "@/app/components/lead-form-notice";
import { LeadUploadField } from "@/app/components/lead-upload-field";
import { getAnalyticsIds } from "@/app/lib/analytics/tracker";
import { pushQuoteSubmit } from "@/app/lib/analytics/gtm-events";

/**
 * Hero quote form — progressive disclosure, full-width. Text comes from the server-loaded
 * dictionary (`dict`) passed down per locale; this component holds only interaction state.
 *
 *  - Collapsed: a horizontal full-width bar — Name · Email · Phone with the submit inline.
 *  - Focusing any field reveals the product-detail fields below; submit moves to the bottom.
 *  - Blurring out while every field is still empty collapses it again.
 *
 * Reuses Caladan's existing form classes verbatim (.form, .input_wrap, .text-field,
 * .text_input-label.label-large, .button_submit-static, .cta_primary) — design unchanged.
 */

export function HeroQuoteForm({
  dict,
  editable = false,
  "data-w-id": dataWId,
  style,
}: {
  dict: Dictionary["form"];
  editable?: boolean;
  "data-w-id"?: string;
  style?: React.CSSProperties;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  // Progressive disclosure clips the 7 detail fields to 0 height (not display:none) until focus — but
  // a clipped field carrying the native `required` attr makes the browser silently refuse to submit
  // (it cannot focus an unfocusable field, so no validation bubble appears — a dead submit button).
  // So if the admin marked ANY detail field required, start expanded (and never auto-collapse): the
  // required fields are then visible, focusable, and validate with feedback. The shipped default only
  // marks name/email/phone required — all in the always-visible bar — so disclosure is unchanged there.
  const req = dict.required;
  const anyDetailRequired =
    req.quantity || req.standard || req.height || req.width || req.thickness || req.upload || req.message;
  const [expanded, setExpanded] = useState(editable || anyDetailRequired); // editor OR a required detail field → start (and stay) expanded
  const [ids, setIds] = useState<{ visitorId: string; sessionId: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setIds(getAnalyticsIds());
  }, []);

  const handleFocus = () => setExpanded(true);

  const handleBlur = (e: React.FocusEvent<HTMLFormElement>) => {
    const form = formRef.current;
    if (!form) return;
    const next = e.relatedTarget as Node | null;
    if (next && form.contains(next)) return; // focus still inside the form
    const hasValue = Array.from(form.elements).some((el) => {
      if (el instanceof HTMLInputElement) {
        if (el.type === "submit" || el.type === "button") return false;
        if (el.type === "file") return !!el.files && el.files.length > 0;
        return el.value.trim() !== "";
      }
      if (el instanceof HTMLSelectElement) return el.value !== "";
      if (el instanceof HTMLTextAreaElement) return el.value.trim() !== "";
      return false;
    });
    if (!hasValue && !editable && !anyDetailRequired) setExpanded(false);
  };

  const detailTab = expanded ? 0 : -1;

  const submitButton = (extraClass: string, tabIndex?: number) => (
    <div button="" className={`button_submit-static ${extraClass}`}>
      <input
        className="button_submit w-button"
        data-wait={dict.submitting}
        tabIndex={tabIndex}
        type="submit"
        value={dict.submit}
      />
      <a
        button=""
        className="cta_primary w-inline-block"
        data-cta="hero-quote"
        data-wf--cta-primary--variant="primary"
        href="#"
        tabIndex={tabIndex}
      >
        <div className="button_text-mask">
          <div button-text="" className="text-button">
            <span {...editableAttrs(editable, "formConfig.submit", { text: { maxLength: 80 } })}>{dict.submit}</span>
          </div>
        </div>
        <div button-bg="" className="btn-bg"></div>
      </a>
    </div>
  );

  return (
    <div className="form-block w-form">
      {/* The form stays in place; the outcome is announced by the toast below. */}
      <form
          ref={formRef}
          id="quote-form"
          name="quote-form"
          className="form is-small hero-quote_panel"
          autoComplete="off"
          data-w-id={dataWId}
          style={style}
          {...editableAttrs(editable, "heroForm.panel", { color: true })}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onSubmit={async (e) => {
            e.preventDefault();
            setState("sending");
            try {
              const body = new FormData(e.currentTarget);
              const res = await fetch("/api/forms/contact/submit", {
                method: "POST",
                body,
              });
              if (res.ok) {
                pushQuoteSubmit(); // GTM: quote_submit → GA4 + Google Ads conversion
                formRef.current?.reset();
                if (!editable) setExpanded(false);
                setState("done");
              } else {
                setState("error");
              }
            } catch {
              setState("error");
            }
          }}
        >
          <LeadFormNotice
            open={state === "done" || state === "error"}
            variant={state === "error" ? "error" : "success"}
            message={state === "error" ? dict.fail : dict.success}
            onClose={() => setState("idle")}
          />
          <fieldset disabled={state === "sending"} style={{ border: 0, padding: 0, margin: 0 }}>
          {ids && (
            <>
              <input type="hidden" name="visitorId" value={ids.visitorId} />
              <input type="hidden" name="sessionId" value={ids.sessionId} />
            </>
          )}
          <div className="hero-quote_inner">
            {/* ---- Contact info — horizontal bar (always visible) ---- */}
            <div className="hero-quote_bar">
              <div className="input_wrap">
                <label className="text_input-label label-large" htmlFor="quote-name">
                  <span className={dict.required.name ? "sx-required" : undefined} {...editableAttrs(editable, "formConfig.fields.name.label", { text: { maxLength: 80 }, color: "heroForm.name" })}>{dict.name}</span>
                </label>
                <input
                  className="text-field w-input"
                  autoComplete="new-password"
                  data-name="Name"
                  id="quote-name"
                  maxLength={256}
                  name="Name"
                  placeholder={dict.namePlaceholder}
                  required={dict.required.name}
                  type="text"
                />
              </div>
              <div className="input_wrap">
                <label className="text_input-label label-large" htmlFor="quote-email">
                  <span className={dict.required.email ? "sx-required" : undefined} {...editableAttrs(editable, "formConfig.fields.email.label", { text: { maxLength: 80 }, color: "heroForm.email" })}>{dict.email}</span>
                </label>
                <input
                  className="text-field w-input"
                  autoComplete="new-password"
                  data-name="Email"
                  id="quote-email"
                  maxLength={256}
                  name="Email"
                  placeholder={dict.emailPlaceholder}
                  required={dict.required.email}
                  type="email"
                />
              </div>
              <div className="input_wrap">
                <label className="text_input-label label-large" htmlFor="quote-phone">
                  <span className={dict.required.phone ? "sx-required" : undefined} {...editableAttrs(editable, "formConfig.fields.phone.label", { text: { maxLength: 80 }, color: "heroForm.phone" })}>{dict.phone}</span>
                </label>
                <input
                  className="text-field w-input"
                  autoComplete="new-password"
                  data-name="Phone"
                  id="quote-phone"
                  maxLength={256}
                  name="Phone"
                  placeholder={dict.phonePlaceholder}
                  required={dict.required.phone}
                  type="tel"
                />
              </div>
              {/* Inline submit at the end of the bar. Kept MOUNTED and merely hidden
                  when expanded (not unmounted) so Webflow IX2's hover-animation binding,
                  which is attached once on page load, survives expand/collapse. */}
              {submitButton(`hero-quote_submit--bar${expanded ? " is-hidden" : ""}`)}
            </div>

            {/* ---- Product details (revealed on focus) ---- */}
            <div
              className={`hero-form_collapsible${expanded ? " is-open" : ""}`}
              aria-hidden={!expanded}
            >
              <div className="hero-form_collapsible-inner">
                <div className="hero-quote_grid hero-quote_grid--3">
                  <div className="input_wrap">
                    <label className="text_input-label label-large" htmlFor="quote-quantity"><span className={dict.required.quantity ? "sx-required" : undefined} {...editableAttrs(editable, "formConfig.fields.quantity.label", { text: { maxLength: 80 }, color: "heroForm.quantity" })}>{dict.quantity}</span></label>
                    <input
                      className="text-field w-input"
                      data-name="Quantity"
                      id="quote-quantity"
                      name="Quantity"
                      placeholder={dict.quantityPlaceholder}
                      required={dict.required.quantity}
                      tabIndex={detailTab}
                      type="text"
                    />
                  </div>
                  <div className="input_wrap">
                    <label className="text_input-label label-large" htmlFor="quote-standard"><span className={dict.required.standard ? "sx-required" : undefined} {...editableAttrs(editable, "formConfig.fields.standard.label", { text: { maxLength: 80 }, color: "heroForm.standard" })}>{dict.standard}</span></label>
                    <select
                      className="text-field select w-select"
                      data-name="Standard"
                      id="quote-standard"
                      name="Standard"
                      required={dict.required.standard}
                      tabIndex={detailTab}
                      defaultValue=""
                    >
                      <option value="">{dict.standardPlaceholder}</option>
                      {dict.standardOptions.map((label) => (
                        <option key={label} value={label}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="input_wrap">
                    <label className="text_input-label label-large" htmlFor="quote-height"><span className={dict.required.height ? "sx-required" : undefined} {...editableAttrs(editable, "formConfig.fields.height.label", { text: { maxLength: 80 }, color: "heroForm.height" })}>{dict.height}</span></label>
                    <input
                      className="text-field w-input"
                      data-name="Height"
                      id="quote-height"
                      inputMode="decimal"
                      name="Height"
                      placeholder={dict.heightPlaceholder}
                      required={dict.required.height}
                      tabIndex={detailTab}
                      type="text"
                    />
                  </div>
                  <div className="input_wrap">
                    <label className="text_input-label label-large" htmlFor="quote-width"><span className={dict.required.width ? "sx-required" : undefined} {...editableAttrs(editable, "formConfig.fields.width.label", { text: { maxLength: 80 }, color: "heroForm.width" })}>{dict.width}</span></label>
                    <input
                      className="text-field w-input"
                      data-name="Width"
                      id="quote-width"
                      inputMode="decimal"
                      name="Width"
                      placeholder={dict.widthPlaceholder}
                      required={dict.required.width}
                      tabIndex={detailTab}
                      type="text"
                    />
                  </div>
                  <div className="input_wrap">
                    <label className="text_input-label label-large" htmlFor="quote-thickness"><span className={dict.required.thickness ? "sx-required" : undefined} {...editableAttrs(editable, "formConfig.fields.thickness.label", { text: { maxLength: 80 }, color: "heroForm.thickness" })}>{dict.thickness}</span></label>
                    <input
                      className="text-field w-input"
                      data-name="Thickness"
                      id="quote-thickness"
                      inputMode="decimal"
                      name="Thickness"
                      placeholder={dict.thicknessPlaceholder}
                      required={dict.required.thickness}
                      tabIndex={detailTab}
                      type="text"
                    />
                  </div>
                  <div className="input_wrap">
                    <div className="text_input-label label-large"><span className={dict.required.upload ? "sx-required" : undefined} {...editableAttrs(editable, "formConfig.fields.upload.label", { text: { maxLength: 80 }, color: "heroForm.upload" })}>{dict.upload}</span></div>
                    {/* Dashed dropzone when empty; thumbnail/file chip + change/remove
                        once a file is picked. Keeps tabIndex for the progressive-
                        disclosure tab gating. */}
                    <LeadUploadField
                      variant="hero"
                      id="quote-sample"
                      name="Sample"
                      accept="image/*,application/pdf"
                      hint={dict.uploadHelp}
                      required={dict.required.upload}
                      tabIndex={detailTab}
                    />
                  </div>
                </div>
                <div className="input_wrap">
                  <label className="text_input-label label-large" htmlFor="quote-message"><span className={dict.required.message ? "sx-required" : undefined} {...editableAttrs(editable, "formConfig.fields.message.label", { text: { maxLength: 80 }, color: "heroForm.message" })}>{dict.message}</span></label>
                  <textarea
                    className="text-field w-input hero-quote_message"
                    data-name="Message"
                    id="quote-message"
                    name="Message"
                    placeholder={dict.messagePlaceholder}
                    required={dict.required.message}
                    tabIndex={detailTab}
                  />
                </div>
                {/* Submit at the bottom of the expanded form */}
                {submitButton("hero-quote_submit", detailTab)}
              </div>
            </div>
          </div>
          </fieldset>
        </form>
    </div>
  );
}
