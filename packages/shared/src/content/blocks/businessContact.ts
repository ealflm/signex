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
  // emailLabel OPTIONAL: the footer's "Email:" field label. Unlike phones/sites, an email carries
  // no per-item label (`emails` is a bare string array), so this is the block-level one. The web
  // falls back to "Email" when absent, so the published v1 snapshot (which predates this field)
  // stays valid — no re-publish required. Editable as `businessContact.emailLabel`.
  emailLabel: LocalizedText.optional(),
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
 * into the three per-presentation shapes the web renders.
 *
 * ⚠️ CURRENTLY UNUSED BY THE WEB. The docstring here used to claim "web call sites read these,
 * never raw fields" — that was false: nothing in apps/web or apps/api calls this (only the tests
 * below). apps/web/app/lib/content.ts does the businessContact→view transform itself, and it
 * CANNOT use these helpers as they stand: it needs each label/value as a separate leaf carrying
 * its own snapshot path (`businessContact.phones.0.label`) so the visual editor can stamp them
 * individually, whereas these pre-compose "Tel: <value>" into one flat string. Composing them here
 * is what the footer's now-removed hardcoded labels were doing by hand.
 * Kept (not deleted) because it is the spec's named §5.2 artifact and the JSON-LD `sameAs` shape
 * may still want it — but it describes an intent the web does not implement. Do not read it as
 * documentation of the live read-path; content.ts is that.
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
