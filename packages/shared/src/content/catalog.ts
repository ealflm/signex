import { z } from "zod";
import { Id, LocalizedText } from "./primitives";

/**
 * A frozen asset reference inside a Release snapshot. URL is NOT frozen — web
 * resolves MEDIA_PUBLIC_BASE + '/' + r2Key at read time (survives CDN/domain
 * migration). `variants` stays [] in the foundation (later responsive sub-project
 * backfills without a snapshot migration).
 */
export const FrozenAsset = z.object({
  assetId: Id,
  r2Key: z.string(),
  mime: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  alt: LocalizedText.optional(),
  poster: z.object({ r2Key: z.string() }).optional(),
  webm: z.object({ r2Key: z.string() }).optional(),
  variants: z
    .array(z.object({ label: z.string(), width: z.number(), r2Key: z.string() }))
    .default([]),
});
export type FrozenAsset = z.infer<typeof FrozenAsset>;

/** A product inside a frozen category (catalog.categories[].items[]). */
export const FrozenProduct = z.object({
  slug: z.string(),
  sortOrder: z.number().int(),
  title: LocalizedText,
  tag: LocalizedText,
  desc: LocalizedText,
  image: FrozenAsset.optional(),
});
export type FrozenProduct = z.infer<typeof FrozenProduct>;

/** A category inside the frozen catalog (catalog.categories[]). */
export const FrozenCategory = z.object({
  slug: z.string(),
  sortOrder: z.number().int(),
  title: LocalizedText,
  tag: LocalizedText,
  intro: LocalizedText,
  productCount: z.number().int(), // locale-invariant stat (18/24/15/12)
  materialCount: z.number().int(), // (4/6/5/3)
  image: FrozenAsset.optional(),
  items: z.array(FrozenProduct), // order-preserving
});
export type FrozenCategory = z.infer<typeof FrozenCategory>;

export const FrozenCatalog = z.object({
  categories: z.array(FrozenCategory),
});
export type FrozenCatalog = z.infer<typeof FrozenCatalog>;

// ===== api RESPONSE DTOs (mirror Prisma rows; ids + timestamps present) =====

export const AssetDTO = z.object({
  id: Id,
  status: z.enum(["PENDING", "READY"]),
  kind: z.enum(["IMAGE", "VIDEO", "SVG"]),
  r2Key: z.string(),
  mime: z.string(),
  bytes: z.number().int(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  originalName: z.string(),
});
export type AssetDTO = z.infer<typeof AssetDTO>;

export const ProductDTO = z.object({
  id: Id,
  categoryId: Id,
  slug: z.string(),
  sortOrder: z.number().int(),
  title: LocalizedText,
  tag: LocalizedText,
  desc: LocalizedText,
  imageId: Id.optional(),
  imageAlt: LocalizedText.optional(),
});
export type ProductDTO = z.infer<typeof ProductDTO>;

export const CategoryDTO = z.object({
  id: Id,
  slug: z.string(),
  sortOrder: z.number().int(),
  title: LocalizedText,
  tag: LocalizedText,
  intro: LocalizedText,
  productCount: z.number().int(),
  materialCount: z.number().int(),
  imageId: Id.optional(),
  imageAlt: LocalizedText.optional(),
  products: z.array(ProductDTO).optional(),
});
export type CategoryDTO = z.infer<typeof CategoryDTO>;

// ===== Input schemas (create/update payloads; no generated fields) =====

export const categoryInputSchema = z.object({
  slug: z.string().min(1),
  sortOrder: z.number().int(),
  title: LocalizedText,
  tag: LocalizedText,
  intro: LocalizedText,
  productCount: z.number().int(),
  materialCount: z.number().int(),
  imageId: z.string().optional().nullable(),
  imageAlt: LocalizedText.optional().nullable(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const productInputSchema = z.object({
  categoryId: z.string().min(1),
  slug: z.string().min(1),
  sortOrder: z.number().int(),
  title: LocalizedText,
  tag: LocalizedText,
  desc: LocalizedText,
  imageId: z.string().optional().nullable(),
  imageAlt: LocalizedText.optional().nullable(),
});
export type ProductInput = z.infer<typeof productInputSchema>;
