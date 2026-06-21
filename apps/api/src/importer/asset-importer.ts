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
 * register dedups by sha256, so byte-identical logos/OG collapse to one Asset row.
 * Returns a logicalId -> FrozenAssetEntry map keyed for catalog + block builders.
 */
export async function importAssets(deps: {
  assets: AssetsService;
  repoRoot?: string;
}): Promise<Map<string, FrozenAssetEntry>> {
  const root = deps.repoRoot ?? resolveRepoRoot();
  const out = new Map<string, FrozenAssetEntry>();

  for (const entry of ASSET_MANIFEST) {
    const bytes = readFileSync(join(root, ASSETS_DIR, entry.relPath));
    const dto = await deps.assets.register(SYSTEM_ACTOR, {
      bytes,
      mime: entry.mime,
      originalName: entry.relPath.split('/').pop()!,
    });
    out.set(entry.logicalId, dtoToFrozen(dto, entry.mime));
  }

  return out;
}
