"use client";

import * as React from "react";

/**
 * Lead-form notification — an inline banner at the top of the form (the form
 * stays put; this sits above its fields). SIGNEX makes emblems, badges and
 * nameplates, so the success cue is a wax seal being stamped: the check presses
 * into a circular seal on appear.
 *
 * role="status" + aria-live announce it; Escape or the close button dismiss it;
 * it auto-hides. If the form was submitted from out of view (long form), the
 * banner scrolls itself into view so the confirmation is never missed. The exit
 * is driven imperatively (a data attribute on the node), so no setState-in-effect.
 */
export interface LeadFormNoticeProps {
  open: boolean;
  variant?: "success" | "error";
  message: string;
  onClose: () => void;
  /** Auto-dismiss delay in ms. */
  duration?: number;
}

export function LeadFormNotice({
  open,
  variant = "success",
  message,
  onClose,
  duration = 6000,
}: LeadFormNoticeProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const closingRef = React.useRef(false);

  const startClose = React.useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    ref.current?.setAttribute("data-leaving", "");
    window.setTimeout(() => {
      closingRef.current = false;
      onClose();
    }, 300);
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;
    closingRef.current = false;
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 8 || r.bottom > window.innerHeight) {
        // The public site drives scrolling through Lenis, which swallows a
        // native scrollIntoView — go through its instance when present.
        const lenis = (
          window as {
            __lenis?: { scrollTo?: (t: Element, o?: { offset?: number }) => void };
          }
        ).__lenis;
        if (lenis?.scrollTo) lenis.scrollTo(el, { offset: -120 });
        else el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    const timer = window.setTimeout(startClose, duration);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") startClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, duration, startClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={`sx-notice sx-notice--${variant}`}
      role="status"
      aria-live="polite"
    >
      <span className="sx-notice__seal" aria-hidden="true">
        {variant === "success" ? (
          <svg viewBox="0 0 24 24" fill="none" className="sx-notice__mark">
            <path
              d="M5 12.5l4.2 4.2L19 7"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="sx-notice__mark">
            <path
              d="M12 7v6"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <circle cx="12" cy="17" r="1.4" fill="currentColor" />
          </svg>
        )}
      </span>
      <p className="sx-notice__msg">{message}</p>
      <button
        type="button"
        className="sx-notice__close"
        aria-label="Đóng thông báo"
        onClick={startClose}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
