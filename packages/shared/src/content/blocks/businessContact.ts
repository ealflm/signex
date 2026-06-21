import { z } from "zod";
import { LocalizedText, Href } from "../primitives";

/**
 * UNIFIED NAP — single source for footer + home contact + contactPage + JSON-LD.
 * Decisions #6/#13: emails/phones/taxId are locale-invariant scalars; legalName +
 * address are localized {en,vi}. Display labels (Tel:/Zalo:/Office:/Factory:/Tax:)
 * live INSIDE the block so it renders self-contained (no cross-block dependency).
 */
export const businessContactBlock = z.object({
  legalName: LocalizedText,
  brand: LocalizedText,
  emails: z.array(z.string().email()).min(1),
  phones: z
    .array(
      z.object({
        kind: z.enum(["tel", "zalo"]),
        label: LocalizedText,
        value: z.string(),
      }),
    )
    .min(1),
  taxId: z.string(),
  taxLabel: LocalizedText,
  sites: z
    .array(
      z.object({
        kind: z.enum(["office", "factory"]),
        label: LocalizedText,
        address: LocalizedText,
        mapEmbedUrl: z.string().optional(),
      }),
    )
    .min(1),
  social: z
    .array(
      z.object({
        kind: z.enum(["facebook", "youtube", "zalo"]),
        href: Href, // seed "#" placeholders (Decisions #5/#12)
      }),
    )
    .default([]),
});
export type BusinessContactBlock = z.infer<typeof businessContactBlock>;

/**
 * Render-helper map (the §5.2 deliverable artifact): resolves a BusinessContactBlock
 * into the three per-presentation shapes the web renders. Keeps the "structural
 * superset of Dictionary" promise — web call sites read these, never raw fields.
 */
export type Locale = "en" | "vi";
export const resolveBusinessContact = (
  bc: BusinessContactBlock,
  lang: Locale,
) => ({
  /** home Phone card + footer tel/zalo lines: "Tel: <value>" */
  phoneLines: bc.phones.map((p) => `${p.label[lang]}: ${p.value}`),
  emailLines: bc.emails,
  /** footer + contactPage address card lines: "Office: <address>" */
  addressLines: bc.sites.map((s) => `${s.label[lang]}: ${s.address[lang]}`),
  legalName: bc.legalName[lang],
  taxLine: `${bc.taxLabel[lang]}: ${bc.taxId}`,
  /** Organization JSON-LD sameAs */
  sameAs: bc.social.map((s) => s.href).filter((h) => h !== "#"),
});
