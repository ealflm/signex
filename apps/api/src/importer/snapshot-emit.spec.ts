import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson, emitInitialSnapshot } from './snapshot-emit';
import { canonicalJson as releaseCj } from '../release/canonical-json';
import { ReleaseSnapshotSchema, type ReleaseSnapshot } from '@signex/shared';

// Helpers mirroring packages/shared/src/content/release.test.ts
const CUID = 'clr1abcd0000xyz1234567890';
const L = (s: string) => ({ en: s, vi: s });
const TT = (lead: string, accent: string) => ({
  lead: L(lead),
  accent: L(accent),
});
const LA = (s: string) => ({ en: [s], vi: [s] });
const ASSET = { assetId: CUID };

/**
 * A fully valid ReleaseSnapshot that passes ReleaseSnapshotSchema.parse.
 * Includes all 12 blocks (BLOCK_REGISTRY requires each), an empty catalog,
 * and the assets map (required since Task 44).
 */
const VALID_BLOCKS = {
  hero: {
    titleTop: L('Top'),
    titleBottom: L('Bottom'),
    subtitle: L('Sub'),
    image: ASSET,
  },
  features: {
    eyebrow: L('Why'),
    title: TT('Why Brands', 'Choose Us'),
    cta: { label: L('See'), href: '/products' },
    video: { title: L('Video'), text: L('Text') },
    featured: { title: L('Featured'), desc: L('Desc') },
    cards: [{ title: L('Card 1'), desc: L('Desc 1') }],
  },
  about: {
    eyebrow: L('About'),
    title: TT('About', 'SIGNEX'),
    body: L('Body'),
    mission: { title: L('Mission'), body: L('Body'), items: LA('Item 1') },
    vision: { title: L('Vision'), body: L('Body') },
    values: { title: L('Values'), body: L('Body') },
  },
  productsHeader: {
    eyebrow: L('Products'),
    title: TT('Our', 'Products'),
    body: L('Body'),
    statLabels: { products: L('Products'), materials: L('Materials') },
    detail: { listTitle: TT('Product', 'List') },
    product: {
      categoryLabel: L('Category'),
      materialLabel: L('Material'),
      cta: L('Contact'),
      ctaHref: '/contact',
      back: L('Back'),
      zoomHint: L('Zoom'),
    },
  },
  footer: {
    tagline: LA('Tagline line'),
    contactHeading: L('Contact'),
    quickHeading: L('Quick Links'),
    links: [{ label: L('Home'), href: '/' }],
    shipLabel: L('Shipping'),
    payLabel: L('Payment'),
    payments: ['VISA'],
  },
  nav: {
    skip: L('Skip to content'),
    logo: ASSET,
    cta: { label: L('Contact'), href: '/contact' },
    links: [{ label: L('Home'), href: '/' }],
  },
  meta: {
    siteName: 'SIGNEX',
    siteUrl: 'https://signex.vn',
    themeColor: '#004EA2',
    title: L('SIGNEX'),
    description: L('Desc'),
    ogImage: ASSET,
    about: { title: L('About SIGNEX'), description: L('Desc') },
    contact: { title: L('Contact'), description: L('Desc') },
  },
  businessContact: {
    legalName: L('SIGNEX Co., Ltd.'),
    brand: L('SIGNEX'),
    emails: ['info@signex.vn'],
    phones: [{ kind: 'tel', label: L('Tel'), value: '+84900000000' }],
    taxId: '0123456789',
    taxLabel: L('Tax ID'),
    sites: [
      {
        kind: 'office',
        label: L('Office'),
        address: L('123 Street, HCMC'),
      },
    ],
  },
  formConfig: {
    fields: {
      name: { label: L('Name') },
      email: { label: L('Email') },
      phone: { label: L('Phone') },
      quantity: { label: L('Qty') },
      standard: { label: L('Standard') },
      height: { label: L('Height') },
      width: { label: L('Width') },
      thickness: { label: L('Thickness') },
      upload: { label: L('Upload') },
      message: { label: L('Message') },
    },
    uploadHelp: L('Upload help'),
    standardOptions: [{ value: 'A', label: L('Option A') }],
    submit: L('Submit'),
    success: L('Success'),
    fail: L('Fail'),
  },
  aboutPage: {
    hero: { title: TT('About', 'SIGNEX'), subtitle: L('Sub') },
    testimonial: { title: TT('What', 'They Say'), body: LA('Quote') },
    approach: [{ title: L('Approach 1'), body: LA('Point') }],
    intro: { title: TT('Intro', 'Lead'), body: L('Body') },
    capability: {
      title: TT('Our', 'Capabilities'),
      groups: [{ title: L('Group'), items: LA('Item') }],
      closing: LA('Closing'),
    },
    process: {
      title: TT('Our', 'Process'),
      steps: [{ title: L('Step 1'), body: L('Body') }],
    },
    timeline: {
      title: TT('Our', 'History'),
      intro: LA('Intro line'),
      milestones: [{ num: '2010', title: L('Founded'), body: L('Story') }],
    },
  },
  contactPage: {
    hero: { title: TT('Contact', 'Us'), subtitle: L('Sub') },
    map: { eyebrow: L('Find'), title: TT('Our', 'Location') },
  },
  notFound: {
    eyebrow: L('Oops'),
    title: TT('Page', 'Not Found'),
    body: L('Body'),
    cta: { label: L('Back Home'), href: '/' },
    image: ASSET,
  },
};

// Build and parse — this must not throw; if it does the test fixture is wrong.
const minimal: ReleaseSnapshot = ReleaseSnapshotSchema.parse({
  schemaVersion: 1,
  blocks: VALID_BLOCKS,
  catalog: { categories: [] },
  assets: {}, // assets map is required; empty is valid (no catalog images in this fixture)
});

describe('canonicalJson', () => {
  it('sorts object keys recursively and is stable', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{"a":{"c":3,"d":2},"b":1}',
    );
  });

  it('preserves array order', () => {
    expect(
      canonicalJson([
        { b: 1, a: 2 },
        { d: 4, c: 3 },
      ]),
    ).toBe('[{"a":2,"b":1},{"c":3,"d":4}]');
  });

  it('throws on bigint', () => {
    expect(() => canonicalJson({ bytes: 10n })).toThrow(/bigint not allowed/i);
  });

  it('is the SAME function as apps/api/src/release/canonical-json (re-exported, not a dup)', () => {
    // Verify output matches the release engine's canonicalJson — no divergence possible.
    expect(canonicalJson({ b: 1, a: 2 })).toBe(releaseCj({ b: 1, a: 2 }));
    expect(canonicalJson({ z: 99, a: { y: 2, x: 1 } })).toBe(
      releaseCj({ z: 99, a: { y: 2, x: 1 } }),
    );
  });
});

describe('emitInitialSnapshot', () => {
  it('writes a TS module whose embedded JSON canonicalizes byte-equal to the source', () => {
    const dir = mkdtempSync(join(tmpdir(), 'snap-'));
    const out = join(dir, 'initial-snapshot.ts');
    const text = emitInitialSnapshot(minimal, out);

    // File was written
    const onDisk = readFileSync(out, 'utf8');
    expect(onDisk).toBe(text);

    // Required export exists
    expect(text).toContain('export const INITIAL_SNAPSHOT');
    expect(text).toContain('schemaVersion');

    // Type annotation from @signex/shared is present
    expect(text).toContain('ReleaseSnapshot');
    expect(text).toContain('@signex/shared');

    // Round-trip: extract the JSON literal — the emitted format is
    //   export const INITIAL_SNAPSHOT = <json> as const satisfies ReleaseSnapshot;
    // so we locate the '= ' before the object and ' as const' after it.
    const assignIdx = onDisk.indexOf('= {');
    const asConstIdx = onDisk.lastIndexOf(' as const satisfies');
    const jsonStr = onDisk.slice(assignIdx + 2, asConstIdx).trimEnd();
    const roundTripped = JSON.parse(jsonStr) as unknown;

    // Byte-equality: canonical of parsed embedded === canonical of original
    expect(canonicalJson(roundTripped)).toBe(canonicalJson(minimal));
  });

  it('returns the same text that was written to disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'snap2-'));
    const out = join(dir, 'initial-snapshot.ts');
    const text = emitInitialSnapshot(minimal, out);
    expect(readFileSync(out, 'utf8')).toBe(text);
  });
});
