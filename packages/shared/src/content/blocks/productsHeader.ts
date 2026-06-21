import { z } from "zod";
import { LocalizedText, TwoToneTitle, Href } from "../primitives";

/** dict.products UI copy minus categories[] (those become relational Catalog). */
export const productsHeaderBlock = z.object({
  eyebrow: LocalizedText,
  title: TwoToneTitle, // title (lead) + titleAccent
  body: LocalizedText,
  statLabels: z.object({ products: LocalizedText, materials: LocalizedText }),
  detail: z.object({ listTitle: TwoToneTitle }), // listTitle (lead) + listTitleAccent
  product: z.object({
    categoryLabel: LocalizedText,
    materialLabel: LocalizedText,
    cta: LocalizedText,
    ctaHref: Href, // promoted literal (was hardcoded /contact)
    back: LocalizedText,
    zoomHint: LocalizedText,
  }),
});
export type ProductsHeaderBlock = z.infer<typeof productsHeaderBlock>;
