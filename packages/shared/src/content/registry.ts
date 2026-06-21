import { z } from "zod";
import {
  heroBlock,
  featuresBlock,
  aboutBlock,
  productsHeaderBlock,
  footerBlock,
  navBlock,
  metaBlock,
  businessContactBlock,
  formConfigBlock,
  aboutPageBlock,
  contactPageBlock,
  notFoundBlock,
} from "./blocks";

/**
 * The single (kind/key)-agnostic registry of every JSON ContentBlock schema.
 * api validates writes by this map; web types its snapshot from it; admin
 * auto-generates forms from it. There is exactly one source of truth.
 */
export const BLOCK_REGISTRY = {
  hero: heroBlock,
  features: featuresBlock,
  about: aboutBlock,
  productsHeader: productsHeaderBlock,
  footer: footerBlock,
  nav: navBlock,
  meta: metaBlock,
  businessContact: businessContactBlock,
  formConfig: formConfigBlock,
  aboutPage: aboutPageBlock,
  contactPage: contactPageBlock,
  notFound: notFoundBlock,
} as const;

export type BlockKey = keyof typeof BLOCK_REGISTRY;

export const BLOCK_KEYS = Object.keys(BLOCK_REGISTRY) as BlockKey[];

/** The fully-validated set of every block, both locales (used by the snapshot). */
export type ReleaseBlocks = {
  [K in BlockKey]: z.infer<(typeof BLOCK_REGISTRY)[K]>;
};

/**
 * Validate `data` against the schema registered under `key`. Throws ZodError
 * on invalid input — the importer relies on this as its conformance gate.
 */
export function parseBlock<K extends BlockKey>(
  key: K,
  data: unknown,
): z.infer<(typeof BLOCK_REGISTRY)[K]> {
  return BLOCK_REGISTRY[key].parse(data) as z.infer<(typeof BLOCK_REGISTRY)[K]>;
}
