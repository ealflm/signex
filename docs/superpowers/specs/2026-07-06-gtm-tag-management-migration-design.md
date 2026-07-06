# GTM tag-management migration for signex.vn

**Date:** 2026-07-06
**Status:** Approved (design)

## Goal

Move all Google marketing/analytics tags on the public site (`apps/web`) from
hardcoded gtag.js to management via the Google Tag Manager container
`GTM-TMHSNCN9`, and record the "Lượt yêu cầu thông tin báo giá" (quote request)
Google Ads conversion through GTM instead of a hardcoded gtag event. Consolidate
management under `core@signex.vn`.

## Current state (verified)

- `app/[lang]/layout.tsx` loads GA4 `G-HTGYKH7Y2T` directly via
  `<GoogleAnalytics gaId={ga4Id}>`; `ga4Id` comes from the SiteConfig singleton
  (`app/lib/site-config.ts` → `getGa4Id()`).
- The Google Ads conversion was first wired as a **direct gtag event**
  (`app/lib/analytics/google-ads.ts` + `reportQuoteConversion()` calls in the two
  quote forms). **This is replaced by the GTM approach below.**
- GTM container `GTM-TMHSNCN9` (account "Signex", container "signex.vn", Web) is
  already under `core@signex.vn`. Google Ads `AW-18302102784` is also under
  `core@signex.vn`. The GA4 property lives under `devsignex@gmail.com`.
- Conversion action "Lượt yêu cầu thông tin báo giá": source Website, manually
  set-up event, value **1 VND** (default), count **"Every"**, label
  `AW-18302102784/TerTCJKnv8scEIDaj5dE`, status currently "Không hoạt động".

## Target architecture

```
apps/web (code)
  └─ loads ONLY container GTM-TMHSNCN9  (<GoogleTagManager> from @next/third-parties)
  └─ on quote submit success:  sendGTMEvent({ event: 'quote_submit', value: 1, currency: 'VND' })

GTM GTM-TMHSNCN9 (managed in the GTM UI, under core@signex.vn)
  ├─ Tag: Google tag / GA4  (G-HTGYKH7Y2T)                → trigger: All Pages
  ├─ Tag: Google Ads Conversion Linker                    → trigger: All Pages
  ├─ Tag: Google Ads Conversion (18302102784 / TerTCJKnv8scEIDaj5dE, 1 VND)
  │                                                        → trigger: Custom Event 'quote_submit'
  └─ (optional) Tag: GA4 event 'generate_lead'            → trigger: Custom Event 'quote_submit'
```

## Part A — Code (`apps/web`)

1. `app/[lang]/layout.tsx`: replace `<GoogleAnalytics gaId={ga4Id}>` with
   `<GoogleTagManager gtmId={GTM_ID}>` (same `@next/third-parties/google` package).
2. `GTM_ID = "GTM-TMHSNCN9"` constant; inject on the public `[lang]` layout only
   (NOT `/preview`), and only in production (`process.env.NODE_ENV === "production"`)
   so local/dev and the CMS editor stay untracked. `getGa4Id()` / the admin
   `ga4Id` field become unused — left in place for a future cleanup (or later
   repurposed to an admin-editable GTM id).
3. Replace `app/lib/analytics/google-ads.ts` with a GTM event helper
   `pushQuoteSubmit()` → `sendGTMEvent({ event: 'quote_submit', value: 1, currency: 'VND' })`.
4. Call `pushQuoteSubmit()` on `res.ok` in `hero-quote-form.tsx` and
   `static-webflow-form.tsx` (both are quote-request forms).
5. Remove the direct-gtag `reportQuoteConversion` path entirely.

## Part B — GTM configuration (GTM UI, `core@signex.vn`, browser)

In container `GTM-TMHSNCN9`, a single workspace:

- **Trigger** — Custom Event, event name `quote_submit`.
- **Tag** — Google tag (GA4) `G-HTGYKH7Y2T`, trigger All Pages.
- **Tag** — Google Ads Conversion Linker, trigger All Pages.
- **Tag** — Google Ads Conversion Tracking: Conversion ID `18302102784`, Label
  `TerTCJKnv8scEIDaj5dE`, value `1`, currency `VND`; trigger Custom Event `quote_submit`.
- **(optional) Tag** — GA4 event `generate_lead`, trigger `quote_submit`.
- Preview, then **Publish** (only after user confirmation).

## Part C — Account consolidation (manual, non-blocking)

`devsignex@gmail.com` grants `core@signex.vn` **Administrator** on the GA4
property. GTM and Ads are already under `core@signex.vn`. Non-blocking: GTM fires
the GA4 tag by measurement id regardless of who owns the GA4 property.

## Anti-double-count invariant

GA4 config exists in **exactly one** place (GTM). The Ads conversion exists in
**exactly one** place (GTM). No gtag GA4 config or conversion event remains in the
site code.

## Verification

- **Local:** `tsc --noEmit`, `next build`, the `static-webflow-form` component test.
- **Live (post-deploy):** GTM Preview + Google Tag Assistant; submit a test quote;
  confirm the GA4 tag and the Ads conversion fire on `quote_submit`; the Ads
  conversion status flips from "Không hoạt động" to active within ~1 day.

## Out of scope

- Consent Mode / GDPR gating (separate follow-up already noted in `layout.tsx`).
- Making the GTM id admin-editable (future; hardcoded constant for now).
- Enhanced conversions.
