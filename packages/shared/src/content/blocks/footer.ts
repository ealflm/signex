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
  payLabel: LocalizedText,
  payments: z.array(z.string()).min(1), // brand codes: VISA/JCB/Napas/COD (locale-invariant)
});
export type FooterBlock = z.infer<typeof footerBlock>;
