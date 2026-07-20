import { z } from "zod";
import { LocalizedText, TwoToneTitle, Href, Overlay } from "../primitives";

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
  // r3 — per-AREA colour washes over catalog imagery ("phủ màu"), the same Overlay primitive as
  // the hero banner. One uniform wash per area, each independently configurable on-canvas
  // (click any image in the area). Absent = transparent = today's look.
  homeCardOverlay: Overlay.optional(),      // homepage category cards
  categoryImageOverlay: Overlay.optional(), // category page: hero image + product-grid cards
  productImageOverlay: Overlay.optional(),  // product-detail main image (NOT the zoom lightbox)
});
export type ProductsHeaderBlock = z.infer<typeof productsHeaderBlock>;
