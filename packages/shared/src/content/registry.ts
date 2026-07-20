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
  floatingButtonsBlock,
} from "./blocks";

/**
 * Thrown by the 3-arg `parseBlock(kind, dbKey, data)` overload when the last
 * dot-segment of `dbKey` does not match any key in `BLOCK_REGISTRY`.
 *
 * The API layer catches this and surfaces it as a 4xx (not a 500).
 */
export class UnknownBlockKeyError extends Error {
  readonly dbKey: string;
  readonly registryKey: string;
  constructor(dbKey: string, registryKey: string) {
    super(`UNKNOWN_BLOCK_KEY: "${dbKey}" (derived registry key: "${registryKey}")`);
    this.name = "UnknownBlockKeyError";
    this.dbKey = dbKey;
    this.registryKey = registryKey;
  }
}

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
  floatingButtons: floatingButtonsBlock,
} as const;

export type BlockKey = keyof typeof BLOCK_REGISTRY;

export const BLOCK_KEYS = Object.keys(BLOCK_REGISTRY) as BlockKey[];

/**
 * The four content-block kinds. Mirrors the Prisma `BlockKind` enum
 * (`packages/db` schema, §5.2). Declared here as a string-literal union so
 * `@signex/shared` stays a leaf package (no dependency on `@signex/db`); the
 * api asserts assignability to the generated Prisma enum at its import site.
 */
export type BlockKind = 'PAGE' | 'SETTINGS' | 'NAV' | 'SEO';

/**
 * Canonical (key → kind) classification for every block in BLOCK_REGISTRY.
 * The single source of truth consumed by the api importer (write path) and the
 * admin content editor (route resolution). The exhaustive `Record<BlockKey,…>`
 * type guarantees every BlockKey has a kind — a missing entry is a build error.
 */
export const BLOCK_KIND_BY_KEY: Record<BlockKey, BlockKind> = {
  hero: 'PAGE',
  features: 'PAGE',
  about: 'PAGE',
  productsHeader: 'PAGE',
  aboutPage: 'PAGE',
  contactPage: 'PAGE',
  notFound: 'PAGE',
  footer: 'SETTINGS',
  businessContact: 'SETTINGS',
  formConfig: 'SETTINGS',
  floatingButtons: 'SETTINGS',
  nav: 'NAV',
  meta: 'SEO',
};

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
 *
 * @remarks
 * **Key-naming constraint (Task 54 importer):** The last dot-segment of `dbKey`
 * MUST equal one of the `BLOCK_REGISTRY` keys. The importer must name
 * `ContentBlock` keys accordingly — e.g. the SEO/meta block's key must end in
 * `.meta` (not `.home`). A mis-named key throws `UnknownBlockKeyError` at write
 * time, which the API layer maps to a 4xx (not a 500).
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
      throw new UnknownBlockKeyError(dbKey, registryKey);
    }
    return BLOCK_REGISTRY[registryKey as BlockKey].parse(maybeData);
  }
  // 2-arg form: parseBlock(key, data)
  return BLOCK_REGISTRY[kindOrKey as BlockKey].parse(keyOrData);
}
