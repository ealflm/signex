import { collectAssetIds, freezeAsset } from './snapshot-assets';

describe('collectAssetIds', () => {
  it('collects asset ids from blocks + catalog', () => {
    const snap = {
      blocks: { hero: { image: { assetId: 'a1' } } },
      catalog: {
        categories: [
          {
            image: { assetId: 'c1' },
            items: [{ image: { assetId: 'p1' } }],
          },
        ],
      },
    };
    expect([...collectAssetIds(snap)].sort()).toEqual(['a1', 'c1', 'p1']);
  });

  it('collects posterAssetId, mp4AssetId, webmAssetId from video refs', () => {
    const snap = {
      hero: {
        video: {
          posterAssetId: 'poster1',
          mp4AssetId: 'mp4-1',
          webmAssetId: 'webm-1',
        },
      },
    };
    expect([...collectAssetIds(snap)].sort()).toEqual([
      'mp4-1',
      'poster1',
      'webm-1',
    ]);
  });

  it('deduplicates ids that appear multiple times', () => {
    const snap = {
      a: { assetId: 'x' },
      b: { assetId: 'x' },
    };
    expect([...collectAssetIds(snap)]).toEqual(['x']);
  });

  it('returns an empty set for primitives and null', () => {
    expect([...collectAssetIds(null)]).toEqual([]);
    expect([...collectAssetIds('string')]).toEqual([]);
    expect([...collectAssetIds(42)]).toEqual([]);
  });

  it('accepts an existing out set and appends to it', () => {
    const existing = new Set(['pre']);
    const result = collectAssetIds({ assetId: 'new' }, existing);
    expect([...result].sort()).toEqual(['new', 'pre']);
    expect(result).toBe(existing);
  });
});

describe('freezeAsset', () => {
  it('produces the FrozenAsset shape with variants: []', () => {
    const asset = {
      id: 'asset-1',
      r2Key: 'originals/abc/logo.svg',
      mime: 'image/svg+xml',
      width: 200,
      height: 80,
      poster: null,
    };
    const frozen = freezeAsset(asset);
    expect(frozen).toEqual({
      assetId: 'asset-1',
      r2Key: 'originals/abc/logo.svg',
      mime: 'image/svg+xml',
      width: 200,
      height: 80,
      variants: [],
    });
  });

  it('includes alt when provided', () => {
    const asset = {
      id: 'a',
      r2Key: 'k',
      mime: 'image/jpeg',
      width: null,
      height: null,
      poster: null,
    };
    const frozen = freezeAsset(asset, { en: 'Logo', vi: 'Logo' });
    expect((frozen as any).alt).toEqual({ en: 'Logo', vi: 'Logo' });
  });

  it('includes poster r2Key when asset has a poster', () => {
    const asset = {
      id: 'vid-1',
      r2Key: 'originals/v.mp4',
      mime: 'video/mp4',
      width: null,
      height: null,
      poster: { r2Key: 'originals/poster.jpg' },
    };
    const frozen = freezeAsset(asset);
    expect((frozen as any).poster).toEqual({ r2Key: 'originals/poster.jpg' });
  });

  it('omits width/height when null', () => {
    const asset = {
      id: 'b',
      r2Key: 'k',
      mime: 'image/jpeg',
      width: null,
      height: null,
      poster: null,
    };
    const frozen = freezeAsset(asset);
    expect('width' in frozen).toBe(false);
    expect('height' in frozen).toBe(false);
  });
});
