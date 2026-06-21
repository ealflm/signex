import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AssetsService, AssetDto } from '../assets/assets.service';
import { SYSTEM_USER_ID } from '../auth/seed-config';
import { ASSET_MANIFEST } from './asset-manifest';
import { resolveRepoRoot } from './dict-source';

export interface FrozenAssetEntry {
  assetId: string;
  r2Key: string;
  mime: string;
  width?: number;
  height?: number;
}

const ASSETS_DIR = join('apps', 'web', 'public', 'assets');

const SYSTEM_ACTOR = { id: SYSTEM_USER_ID, role: 'ADMIN' } as const;

function dtoToFrozen(dto: AssetDto, mime: string): FrozenAssetEntry {
  return {
    assetId: dto.id,
    r2Key: dto.r2Key,
    mime,
    width: dto.width ?? undefined,
    height: dto.height ?? undefined,
  };
}

/**
 * Reads each manifest file from apps/web/public/assets, pushes it through
 * AssetsService.register (sha256 compute + SVG sanitize + R2 put + READY row).
 *
 * Files that appear under multiple logicalIds (e.g. `logo` and `logoFooter` both
 * point at signex-logo.svg) are read and uploaded ONCE — grouped by relPath before
 * the loop. All logicalIds that share a relPath are mapped to the same
 * FrozenAssetEntry, so there is a single register call (and therefore a single Asset
 * row) per unique file, regardless of how many logical slots reference it.
 *
 * Returns a logicalId -> FrozenAssetEntry map keyed for catalog + block builders.
 */
export async function importAssets(deps: {
  assets: AssetsService;
  repoRoot?: string;
}): Promise<Map<string, FrozenAssetEntry>> {
  const root = deps.repoRoot ?? resolveRepoRoot();
  const out = new Map<string, FrozenAssetEntry>();

  // Group manifest entries by relPath so each unique file is uploaded exactly once.
  const byRelPath = new Map<string, (typeof ASSET_MANIFEST)[number][]>();
  for (const entry of ASSET_MANIFEST) {
    const group = byRelPath.get(entry.relPath) ?? [];
    group.push(entry);
    byRelPath.set(entry.relPath, group);
  }

  for (const [relPath, entries] of byRelPath) {
    // Read the file once and upload once — dedup by relPath.
    const bytes = readFileSync(join(root, ASSETS_DIR, relPath));
    // Use the first entry's metadata for the register call; all entries in the group
    // share the same file so kind/mime are identical.
    const primary = entries[0];
    const dto = await deps.assets.register(SYSTEM_ACTOR, {
      bytes,
      mime: primary.mime,
      originalName: relPath.split('/').pop()!,
    });
    const frozen = dtoToFrozen(dto, primary.mime);
    // Map every logicalId that references this file to the single FrozenAssetEntry.
    for (const entry of entries) {
      out.set(entry.logicalId, frozen);
    }
  }

  return out;
}
