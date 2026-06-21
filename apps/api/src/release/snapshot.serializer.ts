import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@signex/db';
import {
  BLOCK_REGISTRY,
  ReleaseSnapshotSchema,
  type ReleaseSnapshot,
} from '@signex/shared';
import { canonicalJson } from './canonical-json';

type AssetRow = {
  id: string;
  r2Key: string;
  mime: string;
  width?: number | null;
  height?: number | null;
  poster?: { r2Key: string } | null;
};

export interface SerializeResult {
  snapshot: ReleaseSnapshot;
  checksum: string;
  assetIds: string[];
  fromRevision: number;
}

@Injectable()
export class SnapshotSerializer {
  /** Freeze a single image/svg asset to the URL-free FrozenAsset shape. */
  freezeAsset(asset: AssetRow, alt?: unknown): Record<string, unknown> {
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

  /** Freeze a video asset: mp4 is primary; poster + webm r2Keys are attached. */
  freezeVideo(
    mp4: AssetRow,
    webm: AssetRow | null,
    poster: AssetRow | null,
  ): Record<string, unknown> {
    return {
      assetId: mp4.id,
      r2Key: mp4.r2Key,
      mime: mp4.mime,
      ...(poster ? { poster: { r2Key: poster.r2Key } } : {}),
      ...(webm ? { webm: { r2Key: webm.r2Key } } : {}),
      variants: [],
    };
  }

  async serialize(client: PrismaClient): Promise<SerializeResult> {
    // 1. Read WorkingState for fromRevision
    const ws = await (client as any).workingState.findUniqueOrThrow({
      where: { id: 'singleton' },
    });

    // 2. Read all ContentBlock rows; map by registry key (last dot-segment)
    const blockRows: Array<{ key: string; data: unknown }> = await (
      client as any
    ).contentBlock.findMany();

    const blocksByKey = new Map<string, unknown>();
    for (const row of blockRows) {
      const registryKey = row.key.includes('.')
        ? row.key.split('.').pop()!
        : row.key;
      blocksByKey.set(registryKey, row.data);
    }

    // Build blocks object in BLOCK_REGISTRY order (schema requires all keys)
    const blocks: Record<string, unknown> = {};
    for (const key of Object.keys(BLOCK_REGISTRY)) {
      blocks[key] = blocksByKey.get(key);
    }

    // 3. Collect assetIds from block JSON (AssetRefs + VideoRefs)
    const assetIds = new Set<string>();
    collectAssetIds(blocks, assetIds);

    // 4. Read categories + products (with images joined)
    const categories: any[] = await (client as any).category.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        image: { include: { poster: true } },
        products: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: { image: { include: { poster: true } } },
        },
      },
    });

    const catalogCategories = categories.map((c: any) => {
      if (c.image) assetIds.add(c.image.id);
      const items = (c.products ?? []).map((p: any) => {
        if (p.image) assetIds.add(p.image.id);
        return {
          slug: p.slug,
          sortOrder: p.sortOrder,
          title: p.title,
          tag: p.tag,
          desc: p.desc,
          // Omit the field entirely when no image — never emit image: null (fails FrozenAsset.optional())
          ...(p.image
            ? { image: this.freezeAsset(p.image, p.imageAlt ?? undefined) }
            : {}),
        };
      });
      return {
        slug: c.slug,
        sortOrder: c.sortOrder,
        title: c.title,
        tag: c.tag,
        intro: c.intro,
        productCount: c.productCount,
        materialCount: c.materialCount,
        ...(c.image
          ? { image: this.freezeAsset(c.image, c.imageAlt ?? undefined) }
          : {}),
        items,
      };
    });

    // 4b. Query Asset table for ALL referenced assetIds and build the assets map.
    // This covers both block AssetRef/VideoRef ids and catalog image ids.
    const allAssetIds = [...assetIds];
    const assetRows: AssetRow[] = allAssetIds.length
      ? await (client as any).asset.findMany({
          where: { id: { in: allAssetIds } },
          include: { poster: true },
        })
      : [];
    const assetsMap: Record<string, unknown> = {};
    for (const row of assetRows) {
      assetsMap[row.id] = this.freezeAsset(row);
    }

    // 5. Assemble candidate and validate via schema
    const candidate = {
      schemaVersion: 1 as const,
      blocks,
      catalog: { categories: catalogCategories },
      assets: assetsMap,
    };

    const snapshot = ReleaseSnapshotSchema.parse(candidate);

    // 6. Deterministic checksum
    const checksum = createHash('sha256')
      .update(canonicalJson(snapshot))
      .digest('hex');

    return {
      snapshot,
      checksum,
      assetIds: [...assetIds],
      fromRevision: ws.revision,
    };
  }
}

/**
 * Recursively collect asset ids from arbitrary block JSON.
 * Handles AssetRef ({ assetId }) and VideoRef ({ posterAssetId, mp4AssetId, webmAssetId }).
 */
function collectAssetIds(value: unknown, out: Set<string>): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const v of value) collectAssetIds(v, out);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const k of ['assetId', 'posterAssetId', 'mp4AssetId', 'webmAssetId']) {
    if (typeof obj[k] === 'string') out.add(obj[k] as string);
  }
  for (const v of Object.values(obj)) collectAssetIds(v, out);
}
