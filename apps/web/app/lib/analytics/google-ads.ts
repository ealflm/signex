// app/lib/analytics/google-ads.ts
// Google Ads conversion tracking — "Lượt yêu cầu thông tin báo giá" (quote request).
//
// This is the *event snippet* Google Ads generated for the SIGNEX account
// (conversion action AW-18302102784, label TerTCJKnv8scEIDaj5dE), fired once per
// SUCCESSFUL quote-form submission — NOT on the raw button click. The forms POST
// asynchronously (with validation), so counting the click would over-count clicks
// that fail validation or never reach the server; counting on `res.ok` records one
// conversion per lead that actually lands. See hero-quote-form.tsx / static-webflow-form.tsx.
//
// This relies on the base Google tag `G-HTGYKH7Y2T` already being loaded in the root
// layout (app/[lang]/layout.tsx → <GoogleAnalytics>, gated on the admin-configured GA4
// id). That Google tag is linked to Ads account AW-18302102784, so `send_to` resolves.
// If the admin GA4 id is unset/different, gtag won't exist and this is a silent no-op.

/** send_to for the "Lượt yêu cầu thông tin báo giá" conversion action (AW account / label). */
export const QUOTE_CONVERSION_SEND_TO = "AW-18302102784/TerTCJKnv8scEIDaj5dE";

type GtagFn = (command: string, event: string, params?: Record<string, unknown>) => void;

/**
 * Report one Google Ads conversion for a successful quote-request submission.
 * No-op on the server, or before the Google tag (gtag.js) has loaded.
 */
export function reportQuoteConversion(): void {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: GtagFn }).gtag;
  if (typeof gtag !== "function") return;
  gtag("event", "conversion", {
    send_to: QUOTE_CONVERSION_SEND_TO,
    value: 1.0,
    currency: "VND",
  });
}
