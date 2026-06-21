export interface CollectedRef {
  field: string;
  assetId: string;
  alt?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Deep-walk a validated block/record value, emitting one CollectedRef per
 * asset USE. Recognizes:
 *   AssetRef  { assetId, alt? }
 *   VideoRef  { posterAssetId, mp4AssetId, webmAssetId? }
 * `field` is a json-path-ish label (e.g. "hero.image", "gallery[2]",
 * "video.media.poster") used as the AssetRef unique key.
 */
export function collectAssetRefs(data: unknown): CollectedRef[] {
  const out: CollectedRef[] = [];

  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (!isRecord(node)) return;

    // VideoRef
    if (typeof node.posterAssetId === 'string' && typeof node.mp4AssetId === 'string') {
      out.push({ field: `${path}.poster`, assetId: node.posterAssetId });
      out.push({ field: `${path}.mp4`, assetId: node.mp4AssetId });
      if (typeof node.webmAssetId === 'string') {
        out.push({ field: `${path}.webm`, assetId: node.webmAssetId });
      }
      return;
    }

    // AssetRef
    if (typeof node.assetId === 'string') {
      out.push(
        node.alt === undefined
          ? { field: path, assetId: node.assetId }
          : { field: path, assetId: node.assetId, alt: node.alt },
      );
      return;
    }

    for (const [k, v] of Object.entries(node)) {
      walk(v, path ? `${path}.${k}` : k);
    }
  };

  walk(data, '');
  return out;
}
