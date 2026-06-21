import { collectAssetRefs } from './asset-ref.util';

describe('collectAssetRefs', () => {
  it('finds a nested AssetRef and labels its json path', () => {
    const data = {
      hero: { image: { assetId: 'a1', alt: { en: 'x', vi: 'y' } } },
    };
    expect(collectAssetRefs(data)).toEqual([
      { field: 'hero.image', assetId: 'a1', alt: { en: 'x', vi: 'y' } },
    ]);
  });

  it('indexes array members (gallery[2])', () => {
    const data = {
      gallery: [{ assetId: 'a0' }, { assetId: 'a1' }, { assetId: 'a2' }],
    };
    expect(collectAssetRefs(data)).toEqual([
      { field: 'gallery[0]', assetId: 'a0' },
      { field: 'gallery[1]', assetId: 'a1' },
      { field: 'gallery[2]', assetId: 'a2' },
    ]);
  });

  it('expands a VideoRef into its poster + mp4 (+ webm) assets', () => {
    const data = {
      video: {
        media: { posterAssetId: 'p1', mp4AssetId: 'm1', webmAssetId: 'w1' },
      },
    };
    expect(collectAssetRefs(data)).toEqual([
      { field: 'video.media.poster', assetId: 'p1' },
      { field: 'video.media.mp4', assetId: 'm1' },
      { field: 'video.media.webm', assetId: 'w1' },
    ]);
  });

  it('omits webm when absent', () => {
    const data = { media: { posterAssetId: 'p1', mp4AssetId: 'm1' } };
    expect(collectAssetRefs(data)).toEqual([
      { field: 'media.poster', assetId: 'p1' },
      { field: 'media.mp4', assetId: 'm1' },
    ]);
  });

  it('ignores plain objects with no assetId/posterAssetId', () => {
    const data = {
      title: { en: 'Hi', vi: 'Chao' },
      count: 4,
      nested: { foo: 'bar' },
    };
    expect(collectAssetRefs(data)).toEqual([]);
  });

  it('dedups identical (field,assetId) but keeps distinct fields for same asset', () => {
    const data = { a: { assetId: 'x' }, b: { assetId: 'x' } };
    expect(collectAssetRefs(data)).toEqual([
      { field: 'a', assetId: 'x' },
      { field: 'b', assetId: 'x' },
    ]);
  });
});
