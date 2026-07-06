// app/lib/analytics/gtm-events.ts
// GTM dataLayer events for the public site. All tags/triggers live in the GTM
// container GTM-TMHSNCN9 (managed under core@signex.vn) — the site only emits
// semantic events and lets GTM decide which tags fire (GA4, the Google Ads
// quote-request conversion, future pixels). The container is loaded in
// app/[lang]/layout.tsx (<GoogleTagManager>, production only).
import { sendGTMEvent } from "@next/third-parties/google";

/**
 * Fire when a quote-request form (hero or contact-quote) submits successfully.
 * In GTM a Custom Event trigger on `quote_submit` drives the "Lượt yêu cầu thông
 * tin báo giá" Google Ads conversion (AW-18302102784/TerTCJKnv8scEIDaj5dE).
 * Pushes to window.dataLayer via @next/third-parties; a no-op with no GTM reader
 * when the container isn't loaded (dev/preview), so it is safe to call on every
 * successful submit.
 */
export function pushQuoteSubmit(): void {
  sendGTMEvent({ event: "quote_submit", value: 1, currency: "VND" });
}
