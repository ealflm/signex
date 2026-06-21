import { z } from "zod";
import { LocalizedText, LocalizedTextArray, Href } from "../primitives";

/**
 * Footer chrome only. The NAP (company/email/tel/zalo/tax/office/factory)
 * is unified into businessContact; the footer reads it via the render-helper map.
 */
export const footerBlock = z.object({
  tagline: LocalizedTextArray, // 2 lines
  contactHeading: LocalizedText,
  quickHeading: LocalizedText,
  links: z.array(z.object({ label: LocalizedText, href: Href })).min(1),
  shipLabel: LocalizedText,
  payLabel: LocalizedText,
  payments: z.array(z.string()).min(1), // brand codes: VISA/JCB/Napas/COD (locale-invariant)
});
export type FooterBlock = z.infer<typeof footerBlock>;
