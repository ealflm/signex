/**
 * Pure, DB-free helpers for asset freezing and id collection.
 * Shared by the release publish path, ThemeService.applyDraftMutation, the
 * importer, and AssetsService.usage — no NestJS DI or Prisma needed.
 */

export type AssetRow = {
  id: string;
  r2Key: string;
  mime: string;
  width?: number | null;
  height?: number | null;
  poster?: { r2Key: string } | null;
};

export type FrozenAsset = Record<string, unknown>;

/**
 * Freeze a single image/svg/video asset to the URL-free FrozenAsset shape.
 * The web layer resolves `MEDIA_PUBLIC_BASE + r2Key` at read time.
 */
export function freezeAsset(asset: AssetRow, alt?: unknown): FrozenAsset {
  return {
    assetId: asset.id,
    r2Key: asset.r2Key,
    mime: asset.mime,
    ...(asset.width != null ? { width: asset.width } : {}),
    ...(asset.height != null ? { height: asset.height } : {}),
    ...(alt ? { alt } : {}),
    ...(asset.poster ? { poster: { r2Key: asset.poster.r2Key } } : {}),
    variants: [],
  };
}

/**
 * Recursively collect asset ids from arbitrary block/catalog JSON.
 * Handles AssetRef ({ assetId }) and VideoRef ({ posterAssetId, mp4AssetId, webmAssetId }).
 *
 * @param value  - Any JSON-serialisable value (object, array, primitive).
 * @param out    - Optional accumulator Set; a fresh Set is created when omitted.
 * @returns      - The same Set (the `out` argument or the newly created one).
 */
export function collectAssetIds(
  value: unknown,
  out: Set<string> = new Set(),
): Set<string> {
  if (value === null || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const v of value) collectAssetIds(v, out);
    return out;
  }
  const obj = value as Record<string, unknown>;
  for (const k of ['assetId', 'posterAssetId', 'mp4AssetId', 'webmAssetId']) {
    if (typeof obj[k] === 'string') out.add(obj[k] as string);
  }
  for (const v of Object.values(obj)) collectAssetIds(v, out);
  return out;
}
