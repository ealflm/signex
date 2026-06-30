"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/**
 * Lead-form notification toast.
 *
 * SIGNEX makes emblems, badges and nameplates — so the success cue is a wax
 * seal being stamped: the check presses into a circular seal on appear. The
 * form itself stays intact behind it; this only announces the outcome.
 *
 * Portalled to <body> so the parallax/Lenis transforms on the page can't trap
 * a position:fixed element. role="status" + aria-live announce it without
 * stealing focus; Escape or the close button dismiss it; it auto-hides.
 *
 * The exit animation is driven imperatively (a data attribute on the node)
 * rather than via state, so there's no setState-in-effect.
 */
export interface LeadFormToastProps {
  open: boolean;
  variant?: "success" | "error";
  message: string;
  onClose: () => void;
  /** Auto-dismiss delay in ms. */
  duration?: number;
}

export function LeadFormToast({
  open,
  variant = "success",
  message,
  onClose,
  duration = 6000,
}: LeadFormToastProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const closingRef = React.useRef(false);

  const startClose = React.useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    cardRef.current?.setAttribute("data-leaving", ""); // play the exit, then unmount
    window.setTimeout(() => {
      closingRef.current = false;
      onClose();
    }, 320);
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;
    closingRef.current = false;
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

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="sx-toast-region">
      <div
        ref={cardRef}
        className={`sx-toast sx-toast--${variant}`}
        role="status"
        aria-live="polite"
      >
        <span className="sx-toast__seal" aria-hidden="true">
          {variant === "success" ? (
            <svg viewBox="0 0 24 24" fill="none" className="sx-toast__mark">
              <path
                d="M5 12.5l4.2 4.2L19 7"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" className="sx-toast__mark">
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
        <p className="sx-toast__msg">{message}</p>
        <button
          type="button"
          className="sx-toast__close"
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
        <span
          className="sx-toast__bar"
          style={{ animationDuration: `${duration}ms` }}
          aria-hidden="true"
        />
      </div>
    </div>,
    document.body,
  );
}
