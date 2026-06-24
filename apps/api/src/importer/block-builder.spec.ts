import { buildBlocks, BLOCK_KIND_BY_KEY } from './block-builder';
import { loadDicts } from './dict-source';
import { parseBlock, BLOCK_REGISTRY } from '@signex/shared';
import type { FrozenAssetEntry } from './asset-importer';

// A valid cuid for use in stubs — cuid format: 'c' + alphanumeric, ~25 chars.
const FAKE_CUID = 'cjld2cjxh0000qzrmn831i7rn';

function assetsStub(): Map<string, FrozenAssetEntry> {
  return new Proxy(new Map(), {
    get(target, prop) {
      if (prop === 'get')
        return (_k: string) => ({
          assetId: FAKE_CUID,
          r2Key: `${_k}.k`,
          mime: 'image/x',
        });
      return (target as any)[prop];
    },
  }) as any;
}

describe('buildBlocks', () => {
  const { en, vi } = loadDicts();
  const blocks = buildBlocks(en, vi, assetsStub());

  it('builds exactly the 12 registry keys', () => {
    expect(blocks.map((b) => b.key).sort()).toEqual(
      Object.keys(BLOCK_REGISTRY).sort(),
    );
  });

  it('every block conforms to its registry schema (parseBlock does not throw)', () => {
    for (const b of blocks) {
      expect(() => parseBlock(b.kind, b.key, b.data)).not.toThrow();
    }
  });

  it('classifies block kinds (nav=NAV, meta=SEO, businessContact=SETTINGS, hero=PAGE)', () => {
    expect(BLOCK_KIND_BY_KEY.nav).toBe('NAV');
    expect(BLOCK_KIND_BY_KEY.meta).toBe('SEO');
    expect(BLOCK_KIND_BY_KEY.businessContact).toBe('SETTINGS');
    expect(BLOCK_KIND_BY_KEY.hero).toBe('PAGE');
  });

  it('unifies NAP into businessContact (emails/phones/tax/sites/social, both locales for legalName/address)', () => {
    const bc: any = blocks.find((b) => b.key === 'businessContact')!.data;
    expect(bc.emails).toEqual(['core@signex.vn', 'nhuadeo@gmail.com']);
    expect(bc.taxId).toBe('0319401172');
    expect(bc.phones.map((p: any) => p.kind)).toEqual(['tel', 'zalo']);
    expect(bc.phones[0].value).toBe('(+84) 979 700 072');
    expect(bc.sites.map((s: any) => s.kind)).toEqual(['office', 'factory']);
    expect(bc.sites[0].address.en).toMatch(/Bui Quang La/);
    expect(bc.legalName.en).toMatch(/SIGNEX BRAND IDENTITY/);
    // social = seeded '#' placeholders (Decision #12)
    expect(bc.social.map((s: any) => s.kind).sort()).toEqual([
      'facebook',
      'youtube',
      'zalo',
    ]);
    expect(bc.social.every((s: any) => s.href === '#')).toBe(true);
  });

  it('promotes meta literals (siteUrl, themeColor, ogImage assetRef, favicons)', () => {
    const meta: any = blocks.find((b) => b.key === 'meta')!.data;
    expect(meta.siteUrl).toBe('https://signex.vn');
    expect(meta.themeColor).toBe('#071522');
    expect(meta.ogImage.assetId).toBe(FAKE_CUID);
    expect(meta.favicons.length).toBeGreaterThanOrEqual(3);
  });

  it('promotes notFound image assetRef + cta label', () => {
    const nf: any = blocks.find((b) => b.key === 'notFound')!.data;
    expect(nf.image.assetId).toBe(FAKE_CUID);
    expect(nf.cta.label.en).toBe('Back to homepage');
  });

  it('populates the newly-configurable optional asset refs (footer.logo, features.featured.image, aboutPage.hero.video + testimonial.image)', () => {
    const footer: any = blocks.find((b) => b.key === 'footer')!.data;
    expect(footer.logo.assetId).toBe(FAKE_CUID);

    const features: any = blocks.find((b) => b.key === 'features')!.data;
    expect(features.featured.image.assetId).toBe(FAKE_CUID);

    const aboutPage: any = blocks.find((b) => b.key === 'aboutPage')!.data;
    expect(aboutPage.hero.video.posterAssetId).toBe(FAKE_CUID);
    expect(aboutPage.hero.video.mp4AssetId).toBe(FAKE_CUID);
    expect(aboutPage.hero.video.webmAssetId).toBe(FAKE_CUID);
    expect(aboutPage.testimonial.image.assetId).toBe(FAKE_CUID);
  });

  it('hero has titleTop and titleBottom as separate localized texts', () => {
    const h: any = blocks.find((b) => b.key === 'hero')!.data;
    expect(h.titleTop.en).toBe('Manufacturing');
    expect(h.titleBottom.en).toBe('Brand Identity');
  });

  it('block keys are the registry keys (last dot-segment matches)', () => {
    for (const b of blocks) {
      const lastSegment = b.key.includes('.') ? b.key.split('.').pop()! : b.key;
      expect(Object.keys(BLOCK_REGISTRY)).toContain(lastSegment);
    }
  });
});
