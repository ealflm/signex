import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  ASSET_MANIFEST,
  categoryImageLogicalId,
  productImageLogicalId,
} from './asset-manifest';
import { importAssets } from './asset-importer';
import { resolveRepoRoot } from './dict-source';

describe('ASSET_MANIFEST', () => {
  it('every manifest file exists in apps/web/public/assets', () => {
    const root = resolveRepoRoot();
    for (const e of ASSET_MANIFEST) {
      expect(existsSync(join(root, 'apps/web/public/assets', e.relPath))).toBe(
        true,
      );
    }
  });

  it('has 4 distinct category images and 6 distinct product images', () => {
    const cats = [0, 1, 2, 3].map(categoryImageLogicalId);
    const prods = [0, 1, 2, 3, 4, 5].map(productImageLogicalId);
    expect(new Set(cats).size).toBe(4);
    expect(new Set(prods).size).toBe(6);
    [...cats, ...prods].forEach((id) =>
      expect(ASSET_MANIFEST.find((m) => m.logicalId === id)).toBeTruthy(),
    );
  });
});

describe('importAssets', () => {
  it('uploads each file through AssetsService.register and dedups by sha256', async () => {
    const root = resolveRepoRoot();

    // Track calls by sha256 to verify dedup
    const uploadedSha256s: string[] = [];
    const sha256ToEntry = new Map<
      string,
      { id: string; r2Key: string; width?: number; height?: number }
    >();

    const registerMock = jest.fn(
      async (
        _actor: unknown,
        input: { bytes: Buffer; mime: string; originalName: string },
      ) => {
        const sha = createHash('sha256').update(input.bytes).digest('hex');
        if (!sha256ToEntry.has(sha)) {
          // first time: "upload" and create entry
          uploadedSha256s.push(sha);
          sha256ToEntry.set(sha, {
            id: 'a_' + sha.slice(0, 8),
            r2Key: `originals/${sha.slice(0, 32)}/x`,
            width: input.mime.startsWith('image/') ? 10 : undefined,
            height: input.mime.startsWith('image/') ? 20 : undefined,
          });
        }
        // subsequent calls return the same entry (dedup)
        const e = sha256ToEntry.get(sha)!;
        return {
          id: e.id,
          status: 'READY',
          kind: 'IMAGE',
          sha256: sha,
          r2Key: e.r2Key,
          url: `https://cdn.example/${e.r2Key}`,
          mime: input.mime,
          bytes: input.bytes.length,
          width: e.width ?? null,
          height: e.height ?? null,
          duration: null,
          originalName: input.originalName,
          altDefault: null,
          posterId: null,
        };
      },
    );

    const assets = { register: registerMock } as any;

    const map = await importAssets({ assets, repoRoot: root });

    // every manifest entry resolved
    for (const e of ASSET_MANIFEST) {
      expect(map.get(e.logicalId)).toBeTruthy();
    }

    // FrozenAssetEntry shape: assetId, r2Key, mime present
    const first = map.get(ASSET_MANIFEST[0].logicalId)!;
    expect(first).toHaveProperty('assetId');
    expect(first).toHaveProperty('r2Key');
    expect(first).toHaveProperty('mime');

    // --- LIVE dedup assertions ---
    // signex-logo.svg is legitimately referenced under TWO logicalIds:
    //   'logo'       — navbar brand link (CSS mask)
    //   'logoFooter' — footer brand column (<img>)
    // importAssets groups by relPath and calls register ONCE for the file, so both
    // logicalIds must resolve to the SAME FrozenAssetEntry (same assetId and r2Key).
    const navLogoEntry = map.get('logo')!;
    const footerLogoEntry = map.get('logoFooter')!;
    expect(navLogoEntry).toBeTruthy();
    expect(footerLogoEntry).toBeTruthy();
    expect(navLogoEntry.assetId).toBe(footerLogoEntry.assetId);
    expect(navLogoEntry.r2Key).toBe(footerLogoEntry.r2Key);

    // Number of distinct uploads (register calls) must be LESS THAN the number of
    // manifest entries, because the duplicate relPath collapsed to one call.
    const uniqueRelPaths = new Set(ASSET_MANIFEST.map((m) => m.relPath)).size;
    expect(registerMock).toHaveBeenCalledTimes(uniqueRelPaths);
    expect(registerMock.mock.calls.length).toBeLessThan(ASSET_MANIFEST.length);

    // bytes come from apps/web/public/assets on disk
    const firstEntry = ASSET_MANIFEST[0];
    const callArg = registerMock.mock.calls[0][1] as {
      bytes: Buffer;
      mime: string;
      originalName: string;
    };
    const diskBytes = readFileSync(
      join(root, 'apps/web/public/assets', firstEntry.relPath),
    );
    expect(callArg.bytes).toEqual(diskBytes);
    expect(callArg.mime).toBe(firstEntry.mime);
  });

  it('does not crash on video files (mp4/webm — no dims)', async () => {
    const root = resolveRepoRoot();

    const registerMock = jest.fn(
      async (
        _actor: unknown,
        input: { bytes: Buffer; mime: string; originalName: string },
      ) => {
        const sha = createHash('sha256').update(input.bytes).digest('hex');
        return {
          id: 'a_' + sha.slice(0, 8),
          status: 'READY',
          kind: 'VIDEO',
          sha256: sha,
          r2Key: `originals/${sha.slice(0, 32)}/x`,
          url: `https://cdn.example/${sha.slice(0, 8)}`,
          mime: input.mime,
          bytes: input.bytes.length,
          width: null,
          height: null,
          duration: null,
          originalName: input.originalName,
          altDefault: null,
          posterId: null,
        };
      },
    );

    const assets = { register: registerMock } as any;

    // Should not throw
    await expect(
      importAssets({ assets, repoRoot: root }),
    ).resolves.toBeTruthy();

    // Video entries should have undefined (not null) width/height in FrozenAssetEntry
    const videoEntries = ASSET_MANIFEST.filter((m) => m.kind === 'VIDEO');
    expect(videoEntries.length).toBeGreaterThan(0);

    const map = await importAssets({ assets, repoRoot: root });
    for (const ve of videoEntries) {
      const frozen = map.get(ve.logicalId)!;
      expect(frozen.width).toBeUndefined();
      expect(frozen.height).toBeUndefined();
    }
  });
});
