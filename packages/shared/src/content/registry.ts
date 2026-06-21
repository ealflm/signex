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
 *
 * Overload 1 (importer / release): `parseBlock(key, data)`
 * Overload 2 (ContentService write path): `parseBlock(kind, key, data)` where
 *   `key` is the DB composite key like "home.hero" and the registry key is
 *   derived from the last dot-segment (e.g. "home.hero" → "hero").
 */
export function parseBlock<K extends BlockKey>(key: K, data: unknown): z.infer<(typeof BLOCK_REGISTRY)[K]>;
export function parseBlock(kind: string, key: string, data: unknown): unknown;
export function parseBlock(
  kindOrKey: string,
  keyOrData: unknown,
  maybeData?: unknown,
): unknown {
  if (maybeData !== undefined) {
    // 3-arg form: parseBlock(kind, dbKey, data)
    // kindOrKey = kind (e.g. "PAGE") — unused for routing, key lives in the registry
    // keyOrData = dbKey (e.g. "home.hero") — last dot-segment gives registry key
    const dbKey = keyOrData as string;
    const registryKey = dbKey.includes('.') ? dbKey.split('.').pop()! : dbKey;
    if (!(registryKey in BLOCK_REGISTRY)) {
      throw new Error(`Unknown block key: "${dbKey}" (derived registry key: "${registryKey}")`);
    }
    return BLOCK_REGISTRY[registryKey as BlockKey].parse(maybeData);
  }
  // 2-arg form: parseBlock(key, data)
  return BLOCK_REGISTRY[kindOrKey as BlockKey].parse(keyOrData);
}
