// app/components/home/hero-quote-form.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { STANDARD_VALUES } from "@/app/lib/standard-options";
import { editText } from "@/app/lib/edit-attrs";

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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

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
  const done = state === "done";
  const [expanded, setExpanded] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  // On submit the success message replaces the form — announce it (role=status) + move focus to it.
  useEffect(() => { if (done) doneRef.current?.focus(); }, [done]);

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
    if (!hasValue) setExpanded(false);
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
        data-wf--cta-primary--variant="primary"
        href="#"
        tabIndex={tabIndex}
      >
        <div className="button_text-mask">
          <div button-text="" className="text-button">
            <span {...editText(editable, "formConfig.submit", { maxLength: 80 })}>{dict.submit}</span>
          </div>
        </div>
        <div button-bg="" className="btn-bg"></div>
      </a>
    </div>
  );

  return (
    <div className="form-block w-form">
      {!done && (
        <form
          ref={formRef}
          id="quote-form"
          name="quote-form"
          className="form is-small hero-quote_panel"
          autoComplete="off"
          data-w-id={dataWId}
          style={style}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onSubmit={async (e) => {
            e.preventDefault();
            setState("sending");
            try {
              const body = new FormData(e.currentTarget);
              const res = await fetch(`${API_BASE}/api/forms/contact/submit`, {
                method: "POST",
                body,
              });
              setState(res.ok ? "done" : "error");
            } catch {
              setState("error");
            }
          }}
        >
          <fieldset disabled={state === "sending"} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="hero-quote_inner">
            {/* ---- Contact info — horizontal bar (always visible) ---- */}
            <div className="hero-quote_bar">
              <div className="input_wrap">
                <label className="text_input-label label-large" htmlFor="quote-name">
                  <span {...editText(editable, "formConfig.fields.name.label", { maxLength: 80 })}>{dict.name}</span>
                  <sup>*</sup>
                </label>
                <input
                  className="text-field w-input"
                  autoComplete="new-password"
                  data-name="Name"
                  id="quote-name"
                  maxLength={256}
                  name="Name"
                  placeholder={dict.namePlaceholder}
                  required
                  type="text"
                />
              </div>
              <div className="input_wrap">
                <label className="text_input-label label-large" htmlFor="quote-email">
                  <span {...editText(editable, "formConfig.fields.email.label", { maxLength: 80 })}>{dict.email}</span>
                  <sup>*</sup>
                </label>
                <input
                  className="text-field w-input"
                  autoComplete="new-password"
                  data-name="Email"
                  id="quote-email"
                  maxLength={256}
                  name="Email"
                  placeholder={dict.emailPlaceholder}
                  required
                  type="email"
                />
              </div>
              <div className="input_wrap">
                <label className="text_input-label label-large" htmlFor="quote-phone">
                  <span {...editText(editable, "formConfig.fields.phone.label", { maxLength: 80 })}>{dict.phone}</span>
                  <sup>*</sup>
                </label>
                <input
                  className="text-field w-input"
                  autoComplete="new-password"
                  data-name="Phone"
                  id="quote-phone"
                  maxLength={256}
                  name="Phone"
                  placeholder={dict.phonePlaceholder}
                  required
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
                    <label className="text_input-label label-large" htmlFor="quote-quantity"><span {...editText(editable, "formConfig.fields.quantity.label", { maxLength: 80 })}>{dict.quantity}</span></label>
                    <input
                      className="text-field w-input"
                      data-name="Quantity"
                      id="quote-quantity"
                      name="Quantity"
                      placeholder={dict.quantityPlaceholder}
                      tabIndex={detailTab}
                      type="text"
                    />
                  </div>
                  <div className="input_wrap">
                    <label className="text_input-label label-large" htmlFor="quote-standard"><span {...editText(editable, "formConfig.fields.standard.label", { maxLength: 80 })}>{dict.standard}</span></label>
                    <select
                      className="text-field select w-select"
                      data-name="Standard"
                      id="quote-standard"
                      name="Standard"
                      tabIndex={detailTab}
                      defaultValue=""
                    >
                      <option value="">{dict.standardPlaceholder}</option>
                      {dict.standardOptions.map((label, i) => (
                        <option key={STANDARD_VALUES[i] ?? label} value={STANDARD_VALUES[i] ?? label}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="input_wrap">
                    <label className="text_input-label label-large" htmlFor="quote-height"><span {...editText(editable, "formConfig.fields.height.label", { maxLength: 80 })}>{dict.height}</span></label>
                    <input
                      className="text-field w-input"
                      data-name="Height"
                      id="quote-height"
                      inputMode="decimal"
                      name="Height"
                      placeholder={dict.heightPlaceholder}
                      tabIndex={detailTab}
                      type="text"
                    />
                  </div>
                  <div className="input_wrap">
                    <label className="text_input-label label-large" htmlFor="quote-width"><span {...editText(editable, "formConfig.fields.width.label", { maxLength: 80 })}>{dict.width}</span></label>
                    <input
                      className="text-field w-input"
                      data-name="Width"
                      id="quote-width"
                      inputMode="decimal"
                      name="Width"
                      placeholder={dict.widthPlaceholder}
                      tabIndex={detailTab}
                      type="text"
                    />
                  </div>
                  <div className="input_wrap">
                    <label className="text_input-label label-large" htmlFor="quote-thickness"><span {...editText(editable, "formConfig.fields.thickness.label", { maxLength: 80 })}>{dict.thickness}</span></label>
                    <input
                      className="text-field w-input"
                      data-name="Thickness"
                      id="quote-thickness"
                      inputMode="decimal"
                      name="Thickness"
                      placeholder={dict.thicknessPlaceholder}
                      tabIndex={detailTab}
                      type="text"
                    />
                  </div>
                  <div className="input_wrap">
                    <div className="text_input-label label-large"><span {...editText(editable, "formConfig.fields.upload.label", { maxLength: 80 })}>{dict.upload}</span></div>
                    {/* Custom dashed dropzone (dark-panel variant of the contact form's
                        upload): the <label> wraps the visually-hidden file input, which keeps
                        its tabIndex (progressive-disclosure tab gating) and is still counted
                        by handleBlur's file-value check. */}
                    <label className="hero-quote_upload">
                      <input
                        accept=".jpg,.jpeg,.png,.pdf"
                        className="hero-quote_upload-input"
                        data-name="Sample"
                        name="Sample"
                        tabIndex={detailTab}
                        type="file"
                      />
                      <span className="hero-quote_upload-icon w-embed" aria-hidden="true">
                        <svg fill="none" height="100%" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="100%" xmlns="http://www.w3.org/2000/svg">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" x2="12" y1="3" y2="15" />
                        </svg>
                      </span>
                      <span className="hero-quote_upload-text">{dict.uploadHelp}</span>
                    </label>
                  </div>
                </div>
                <div className="input_wrap">
                  <label className="text_input-label label-large" htmlFor="quote-message"><span {...editText(editable, "formConfig.fields.message.label", { maxLength: 80 })}>{dict.message}</span></label>
                  <textarea
                    className="text-field w-input hero-quote_message"
                    data-name="Message"
                    id="quote-message"
                    name="Message"
                    placeholder={dict.messagePlaceholder}
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
      )}
      {done && (
        <div ref={doneRef} tabIndex={-1} role="status" className="success-message w-form-done" style={{ display: "block" }}>
          <div>{dict.success}</div>
        </div>
      )}
      {state === "error" && (
        <div className="error-message w-form-fail" style={{ display: "block" }}>
          <div>{dict.fail}</div>
        </div>
      )}
    </div>
  );
}
