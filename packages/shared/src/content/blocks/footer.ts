import { z } from "zod";
import { LocalizedText, LocalizedTextArray, Href, AssetRef } from "../primitives";

/**
 * Footer chrome only. The NAP (company/email/tel/zalo/tax/office/factory)
 * is unified into businessContact; the footer reads it via the render-helper map.
 */
export const footerBlock = z.object({
  // Brand logo shown in the footer's first column. OPTIONAL: the web falls back to the
  // literal /assets/images/signex-logo.svg when absent, so the published v1 snapshot
  // (which predates this field) stays valid — no re-publish required.
  logo: AssetRef.optional(),
  // Decorative lotus watermark in the footer background. OPTIONAL: the web falls back to the literal
  // /assets/images/lotus.svg when absent (published v1 snapshot stays valid). The visual editor edits
  // it as `footer.watermark`.
  watermark: AssetRef.optional(),
  // brandSuffix OPTIONAL: the tail of the footer brand line, rendered after "<brand> – " (default
  // "Manufacturing Brand Identity"). The web falls back to that literal when absent, so the published
  // v1 snapshot (which predates this field) stays valid — no re-publish required. Editable via the
  // visual editor as `footer.brandSuffix` (the "<brand> – " prefix is a derived template, not edited).
  brandSuffix: LocalizedText.optional(),
  tagline: LocalizedTextArray, // 2 lines
  contactHeading: LocalizedText,
  quickHeading: LocalizedText,
  links: z.array(z.object({ label: LocalizedText, href: Href })).min(1),
  shipLabel: LocalizedText,
  // shipping OPTIONAL: courier-partner badges (Lalamove/Grab — brand names, locale-invariant).
  // The web falls back to ["Lalamove","Grab"] when absent, so the published v1 snapshot (which
  // predates this field) stays valid — no re-publish required.
  //
  // OPTIONAL is a COMPATIBILITY hatch for old snapshots, NOT the steady state. It used to be the
  // steady state by accident: this field was declared editable but nothing ever WROTE it — the
  // importer's buildFooter did not emit it and no snapshot in the database carried it, so every
  // badge on the live site came from the web's fallback literal while the admin's own string-list
  // editor showed "shipping (0 items)". A field the panel reports as empty and the page renders
  // two of is the same divergence class as the NAP labels. Both halves are now closed: buildFooter
  // seeds it for new sites, and migration 20260716_footer_shipping_backfill backfills existing
  // theme drafts. Keep the `??` fallback anyway — a snapshot published before either is still a
  // valid FooterBlock, and that is exactly what `.optional()` is promising.
  //
  // Both badge lists are editable TWO ways: click-to-edit on the canvas (footer.shipping.<i> /
  // footer.payments.<i>) and the section panel's string-list editor (deriveFields → "stringArray").
  // Per-item inline editing REQUIRES the array to exist in the draft: the admin resolves an inline
  // edit by inspecting the value already at the path, so an index into an absent array cannot be
  // recognised as a string-array item — which is why seeding it is load-bearing, not tidying.
  shipping: z.array(z.string()).min(1).optional(),
  payLabel: LocalizedText,
  // Brand codes: VISA/JCB/Napas/COD. LOCALE-INVARIANT — one array, rendered verbatim in both
  // locales (there is no en/vi split here, so /vi shows whatever /en shows).
  payments: z.array(z.string()).min(1),
});
export type FooterBlock = z.infer<typeof footerBlock>;
