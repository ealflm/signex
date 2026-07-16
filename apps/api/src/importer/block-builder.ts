import type { BlockKind } from '@signex/db';
import {
  parseBlock,
  BLOCK_KIND_BY_KEY,
  type BlockKey,
  type BlockKind as SharedBlockKind,
} from '@signex/shared';
import type { RawDict } from './dict-source';
import { lt, ltArray, twoTone, type LT } from './zip';
import type { FrozenAssetEntry } from './asset-importer';

// Compile-time guarantee that the canonical kind union in @signex/shared and
// the Prisma-generated BlockKind enum stay in lock-step. If the Prisma enum
// ever drifts, one of these assignments fails to type-check at build time.
type _AssertSharedKindIsPrismaKind = SharedBlockKind extends BlockKind
  ? true
  : never;
type _AssertPrismaKindIsSharedKind = BlockKind extends SharedBlockKind
  ? true
  : never;
const _kindParity: [
  _AssertSharedKindIsPrismaKind,
  _AssertPrismaKindIsSharedKind,
] = [true, true];
void _kindParity;

// `BLOCK_KIND_BY_KEY` is the canonical (key → kind) map, now owned by
// @signex/shared (re-exported here for existing importer call sites).
export { BLOCK_KIND_BY_KEY };

export interface BuiltBlock {
  kind: BlockKind;
  key: string;
  data: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mustAsset(
  assets: Map<string, FrozenAssetEntry>,
  logicalId: string,
): FrozenAssetEntry {
  const a = assets.get(logicalId);
  if (!a) throw new Error(`block-builder: missing asset "${logicalId}"`);
  return a;
}

function assetRef(
  assets: Map<string, FrozenAssetEntry>,
  logicalId: string,
  alt?: LT,
): { assetId: string; alt?: LT } {
  const a = mustAsset(assets, logicalId);
  return alt ? { assetId: a.assetId, alt } : { assetId: a.assetId };
}

function videoRef(
  assets: Map<string, FrozenAssetEntry>,
  poster: string,
  mp4: string,
  webm: string,
): { posterAssetId: string; mp4AssetId: string; webmAssetId: string } {
  return {
    posterAssetId: mustAsset(assets, poster).assetId,
    mp4AssetId: mustAsset(assets, mp4).assetId,
    webmAssetId: mustAsset(assets, webm).assetId,
  };
}

// ---------------------------------------------------------------------------
// Per-block builders (each conforms to the exact @signex/shared schema)
// ---------------------------------------------------------------------------

function buildHero(E: any, V: any, assets: Map<string, FrozenAssetEntry>) {
  // heroBlock: { titleTop: LocalizedText, titleBottom: LocalizedText, subtitle, image }
  return {
    titleTop: lt(E.hero.titleTop, V.hero.titleTop),
    titleBottom: lt(E.hero.titleBottom, V.hero.titleBottom),
    subtitle: lt(E.hero.subtitle, V.hero.subtitle),
    image: assetRef(assets, 'hero', lt(E.hero.imageAlt, V.hero.imageAlt)),
  };
}

function buildFeatures(E: any, V: any, assets: Map<string, FrozenAssetEntry>) {
  // featuresBlock: { eyebrow, title: TwoToneTitle, cta: {label, href}, video: {title, text, media?: VideoRef}, featured, cards }
  return {
    eyebrow: lt(E.features.eyebrow, V.features.eyebrow),
    title: twoTone(
      E.features.titleTop,
      V.features.titleTop,
      E.features.titleBottom,
      V.features.titleBottom,
    ),
    cta: {
      label: lt(E.features.cta, V.features.cta),
      href: '#quote-form',
    },
    video: {
      title: lt(E.features.videoTitle, V.features.videoTitle),
      text: lt(E.features.videoText, V.features.videoText),
      media: videoRef(
        assets,
        'homeVideoPoster',
        'homeVideoMp4',
        'homeVideoWebm',
      ),
    },
    featured: {
      title: lt(E.features.featured.title, V.features.featured.title),
      desc: lt(E.features.featured.desc, V.features.featured.desc),
      image: assetRef(
        assets,
        'featuresStill',
        lt('Consistent production quality', 'Chất lượng sản xuất ổn định'),
      ),
    },
    cards: (E.features.cards as any[]).map((c, i) => ({
      title: lt(c.title, V.features.cards[i].title),
      desc: lt(c.desc, V.features.cards[i].desc),
    })),
  };
}

function buildAbout(E: any, V: any) {
  // aboutBlock: { eyebrow, title: TwoToneTitle, body, mission: {title, body, items}, vision, values }
  return {
    eyebrow: lt(E.about.eyebrow, V.about.eyebrow),
    title: twoTone(
      E.about.title,
      V.about.title,
      E.about.titleAccent,
      V.about.titleAccent,
    ),
    body: lt(E.about.body, V.about.body),
    mission: {
      title: lt(E.about.mission.title, V.about.mission.title),
      body: lt(E.about.mission.body, V.about.mission.body),
      items: ltArray(E.about.mission.items, V.about.mission.items),
    },
    vision: {
      title: lt(E.about.vision.title, V.about.vision.title),
      body: lt(E.about.vision.body, V.about.vision.body),
    },
    values: {
      title: lt(E.about.values.title, V.about.values.title),
      body: lt(E.about.values.body, V.about.values.body),
    },
  };
}

function buildProductsHeader(E: any, V: any) {
  // productsHeaderBlock: { eyebrow, title: TwoToneTitle, body, statLabels, detail: {listTitle: TwoToneTitle}, product }
  const p = E.products;
  const vp = V.products;
  return {
    eyebrow: lt(p.eyebrow, vp.eyebrow),
    title: twoTone(p.title, vp.title, p.titleAccent, vp.titleAccent),
    body: lt(p.body, vp.body),
    statLabels: {
      products: lt(p.statLabels.products, vp.statLabels.products),
      materials: lt(p.statLabels.materials, vp.statLabels.materials),
    },
    detail: {
      listTitle: twoTone(
        p.detail.listTitle,
        vp.detail.listTitle,
        p.detail.listTitleAccent,
        vp.detail.listTitleAccent,
      ),
    },
    product: {
      categoryLabel: lt(p.product.categoryLabel, vp.product.categoryLabel),
      materialLabel: lt(p.product.materialLabel, vp.product.materialLabel),
      cta: lt(p.product.cta, vp.product.cta),
      ctaHref: '#quote-form',
      back: lt(p.product.back, vp.product.back),
      zoomHint: lt(p.product.zoomHint, vp.product.zoomHint),
    },
  };
}

function buildFooter(E: any, V: any, assets: Map<string, FrozenAssetEntry>) {
  // footerBlock: { logo?: AssetRef, watermark?: AssetRef, brandSuffix?, tagline, contactHeading, quickHeading, links, shipLabel, shipping?, payLabel, payments }
  // The footer brand logo is a configurable AssetRef (logoFooter == the same signex-logo.svg as nav,
  // deduped to one Asset row). The decorative lotus watermark is now configurable too (footer.watermark
  // → the 'lotus' manifest asset), editable via the visual editor; the web falls back to lotus.svg.
  const f = E.footer;
  const vf = V.footer;
  return {
    logo: assetRef(assets, 'logoFooter'),
    watermark: assetRef(assets, 'lotus'),
    // brandSuffix seeds the editable tail of the footer brand line ("<brand> – <suffix>"). OPTIONAL
    // in the schema; the web falls back to this same literal when absent (FRESH seed only).
    brandSuffix: lt('Manufacturing Brand Identity', 'Manufacturing Brand Identity'),
    tagline: ltArray(f.tagline, vf.tagline),
    contactHeading: lt(f.contactHeading, vf.contactHeading),
    quickHeading: lt(f.quickHeading, vf.quickHeading),
    links: (f.links as any[]).map((l: any, i: number) => ({
      label: lt(l.label, vf.links[i].label),
      href: l.href as string,
    })),
    shipLabel: lt(f.shipLabel, vf.shipLabel),
    // Courier badges. OPTIONAL in the schema (old snapshots predate it) and the web falls back to
    // these same two literals — but a fresh seed must still EMIT them, exactly like brandSuffix
    // above. Until now nothing did, so `shipping` existed only as a web-side fallback: the badges
    // rendered, yet the field was absent from every snapshot, which left the admin's string-list
    // editor showing zero items and made per-item inline editing (footer.shipping.<i>) impossible
    // to resolve. Locale-invariant brand names, so no lt() — same shape as payments below.
    shipping: ['Lalamove', 'Grab'],
    payLabel: lt(f.payLabel, vf.payLabel),
    payments: f.payments as string[],
  };
}

function buildNav(E: any, V: any, assets: Map<string, FrozenAssetEntry>) {
  // navBlock: { skip, logo: AssetRef, cta: {label, href}, links }
  const n = E.nav;
  const vn = V.nav;
  return {
    skip: lt(n.skip, vn.skip),
    logo: assetRef(assets, 'logo'),
    cta: {
      label: lt(n.cta, vn.cta),
      href: '#quote-form',
    },
    links: (n.links as any[]).map((l: any, i: number) => ({
      label: lt(l.label, vn.links[i].label),
      href: l.href as string,
    })),
  };
}

function buildMeta(E: any, V: any, assets: Map<string, FrozenAssetEntry>) {
  // metaBlock: { siteName, siteUrl, themeColor, title, description, ogImage: AssetRef,
  //              favicons: [{rel, asset: AssetRef}], about: pageMeta, contact: pageMeta }
  // Literals from seo.ts: SITE_URL = 'https://signex.vn', THEME_COLOR = '#071522'
  const m = E.meta;
  const vm = V.meta;

  const faviconAsset = (logicalId: string) => ({
    assetId: mustAsset(assets, logicalId).assetId,
  });

  return {
    siteName: m.siteName as string,
    siteUrl: 'https://signex.vn',
    themeColor: '#071522',
    title: lt(m.title, vm.title),
    description: lt(m.description, vm.description),
    ogImage: assetRef(assets, 'og', lt(m.ogImageAlt, vm.ogImageAlt)),
    favicons: [
      { rel: 'icon', asset: faviconAsset('favicon32') },
      { rel: 'icon', asset: faviconAsset('favicon16') },
      { rel: 'apple-touch-icon', asset: faviconAsset('appleTouch') },
      { rel: 'icon', asset: faviconAsset('androidChrome192') },
      { rel: 'icon', asset: faviconAsset('androidChrome512') },
    ],
    about: {
      title: lt(m.about.title, vm.about.title),
      description: lt(m.about.description, vm.about.description),
    },
    contact: {
      title: lt(m.contact.title, vm.contact.title),
      description: lt(m.contact.description, vm.contact.description),
    },
  };
}

function buildBusinessContact(E: any, V: any) {
  // businessContactBlock: { legalName: LocalizedText, brand: LocalizedText, emails, phones, taxId, taxLabel, sites, social }
  // UNIFIED NAP — single source for footer + home contact + contactPage + JSON-LD.
  // Decision #13: emails/phones/taxId are locale-invariant scalars; legalName/address localized.
  // Second email (nhuadeo@gmail.com) promoted from dict.contact.cards[0].lines[1]
  const f = E.footer;
  const vf = V.footer;
  return {
    legalName: lt(f.company, vf.company),
    brand: lt(E.meta.siteName, V.meta.siteName),
    emails: [f.email as string, 'nhuadeo@gmail.com'],
    phones: [
      {
        kind: 'tel' as const,
        label: lt('Tel', 'Tel'),
        value: f.tel as string,
      },
      {
        kind: 'zalo' as const,
        label: lt('Zalo', 'Zalo'),
        value: f.zalo as string,
      },
    ],
    taxId: f.tax as string,
    taxLabel: lt('Tax', 'Tax'),
    sites: [
      {
        kind: 'office' as const,
        label: lt('Office', 'Office'),
        address: lt(f.office, vf.office),
      },
      {
        kind: 'factory' as const,
        label: lt('Factory', 'Factory'),
        address: lt(f.factory, vf.factory),
        // Factory map embed (from org-json-ld.tsx / contact page knowledge)
        mapEmbedUrl:
          'https://www.google.com/maps?q=85%2F45%20D%C6%B0%C6%A1ng%20Th%E1%BB%8B%20M%C6%B0%E1%BB%9Di%2C%20Ph%C6%B0%E1%BB%9Dng%20Trung%20M%E1%BB%B9%20T%C3%A2y%2C%20Tp.HCM&output=embed&z=16',
      },
    ],
    // Decision #12: keep '#' placeholders; Admin fills post-launch (feeds JSON-LD sameAs).
    social: [
      { kind: 'facebook' as const, href: '#' },
      { kind: 'youtube' as const, href: '#' },
      { kind: 'zalo' as const, href: '#' },
    ],
  };
}

function buildFormConfig(E: any, V: any) {
  // formConfigBlock: { fields: {name, email, phone, quantity, standard, height, width, thickness, upload, message},
  //                   uploadHelp, standardOptions, submit, success, fail }
  // Each field: { label, placeholder?, required? }
  const f = E.form;
  const vf = V.form;

  const fld = (key: string, required = false) => ({
    label: lt(f[key], vf[key]),
    ...(f[`${key}Placeholder`] !== undefined
      ? { placeholder: lt(f[`${key}Placeholder`], vf[`${key}Placeholder`]) }
      : {}),
    required,
  });

  // STANDARD_VALUES (locale-invariant submit values) from standard-options.ts
  const STANDARD_VALUES = [
    'OEKO-TEX Standard 100',
    'ISO 9001',
    'GRS (Recycled)',
    'GOTS (Organic)',
    'Other / Custom',
  ];

  return {
    fields: {
      name: fld('name', true),
      email: fld('email', true),
      phone: fld('phone', true),
      quantity: fld('quantity'),
      standard: fld('standard'),
      height: fld('height'),
      width: fld('width'),
      thickness: fld('thickness'),
      upload: fld('upload'),
      message: fld('message'),
    },
    uploadHelp: lt(f.uploadHelp, vf.uploadHelp),
    standardOptions: STANDARD_VALUES.map((value, i) => ({
      value,
      label: lt(
        (f.standardOptions as string[])[i],
        (vf.standardOptions as string[])[i],
      ),
    })),
    submit: lt(f.submit, vf.submit),
    success: lt(f.success, vf.success),
    fail: lt(f.fail, vf.fail),
  };
}

function buildAboutPage(E: any, V: any, assets: Map<string, FrozenAssetEntry>) {
  // aboutPageBlock: { hero: { ..., video?: VideoRef }, testimonial: { ..., image?: AssetRef }, approach, intro, capability, process, timeline }
  // The about hero background video + the testimonial still are now configurable refs (manifest
  // logicalIds 'aboutVideo*' / 'testimonial', previously registered but unreferenced).
  const a = E.aboutPage;
  const v = V.aboutPage;

  const tt = (en: any, vi: any) =>
    twoTone(en.title, vi.title, en.titleAccent, vi.titleAccent);

  return {
    hero: {
      title: tt(a.hero, v.hero),
      subtitle: lt(a.hero.subtitle, v.hero.subtitle),
      video: videoRef(
        assets,
        'aboutVideoPoster',
        'aboutVideoMp4',
        'aboutVideoWebm',
      ),
    },
    testimonial: {
      eyebrow: lt(a.testimonial.eyebrow, v.testimonial.eyebrow),
      title: tt(a.testimonial, v.testimonial),
      body: ltArray(a.testimonial.body, v.testimonial.body),
      image: assetRef(
        assets,
        'testimonial',
        lt('Client testimonial', 'Cảm nhận khách hàng'),
      ),
    },
    approach: (a.approach as any[]).map((g: any, i: number) => ({
      title: lt(g.title, v.approach[i].title),
      body: ltArray(g.body, v.approach[i].body),
    })),
    intro: {
      eyebrow: lt(a.intro.eyebrow, v.intro.eyebrow),
      title: tt(a.intro, v.intro),
      body: lt(a.intro.body, v.intro.body),
    },
    capability: {
      eyebrow: lt(a.capability.eyebrow, v.capability.eyebrow),
      title: tt(a.capability, v.capability),
      body: lt(a.capability.body, v.capability.body),
      groups: (a.capability.groups as any[]).map((g: any, i: number) => ({
        title: lt(g.title, v.capability.groups[i].title),
        items: ltArray(g.items, v.capability.groups[i].items),
      })),
      closing: ltArray(a.capability.closing, v.capability.closing),
    },
    process: {
      eyebrow: lt(a.process.eyebrow, v.process.eyebrow),
      title: tt(a.process, v.process),
      body: lt(a.process.body, v.process.body),
      steps: (a.process.steps as any[]).map((s: any, i: number) => ({
        title: lt(s.title, v.process.steps[i].title),
        body: lt(s.body, v.process.steps[i].body),
      })),
    },
    timeline: {
      eyebrow: lt(a.timeline.eyebrow, v.timeline.eyebrow),
      title: tt(a.timeline, v.timeline),
      body: lt(a.timeline.body, v.timeline.body),
      intro: ltArray(a.timeline.intro, v.timeline.intro),
      milestones: (a.timeline.milestones as any[]).map((m: any, i: number) => {
        const vm = v.timeline.milestones[i];
        const out: any = {
          num: m.num as string,
          title: lt(m.title, vm.title),
          body: lt(m.body, vm.body),
        };
        if (m.items !== undefined) out.items = ltArray(m.items, vm.items);
        if (m.note !== undefined) out.note = lt(m.note, vm.note);
        return out;
      }),
    },
  };
}

function buildContactPage(
  E: any,
  V: any,
  assets: Map<string, FrozenAssetEntry>,
) {
  // contactPageBlock: { hero: {title: TwoToneTitle, subtitle, image?: AssetRef}, map: {eyebrow, title: TwoToneTitle} }
  // NAP cards come from businessContact (not duplicated here). The hero parallax still is now a
  // configurable AssetRef ('contactParallax' == the sara-dubler unsplash, previously registered but
  // unreferenced), editable via the visual editor; the web falls back to the literal when absent.
  const c = E.contactPage;
  const v = V.contactPage;
  return {
    // eyebrow + cardLabels seed the home contact section's eyebrow and the Email/Phone/Address NAP
    // card titles (shared with the contact page). OPTIONAL in the schema; the web falls back to the
    // same literals when absent, so this only affects a FRESH seed.
    eyebrow: lt('Reach Out', 'Liên Hệ'),
    cardLabels: {
      email: lt('Email', 'Email'),
      phone: lt('Phone', 'Điện thoại'),
      address: lt('Address', 'Địa chỉ'),
    },
    hero: {
      title: twoTone(
        c.hero.title,
        v.hero.title,
        c.hero.titleAccent,
        v.hero.titleAccent,
      ),
      subtitle: lt(c.hero.subtitle, v.hero.subtitle),
      image: assetRef(
        assets,
        'contactParallax',
        lt('Signex contact', 'Liên hệ Signex'),
      ),
    },
    map: {
      eyebrow: lt(c.map.eyebrow, v.map.eyebrow),
      title: twoTone(
        c.map.title,
        v.map.title,
        c.map.titleAccent,
        v.map.titleAccent,
      ),
    },
  };
}

function buildNotFound(E: any, V: any, assets: Map<string, FrozenAssetEntry>) {
  // notFoundBlock: { eyebrow, title: TwoToneTitle, body, cta: {label, href}, image: AssetRef }
  const n = E.notFound;
  const vn = V.notFound;
  return {
    eyebrow: lt(n.eyebrow, vn.eyebrow),
    title: twoTone(n.title, vn.title, n.titleAccent, vn.titleAccent),
    body: lt(n.body, vn.body),
    cta: {
      label: lt(n.cta, vn.cta),
      href: '/',
    },
    image: assetRef(assets, 'notFound', lt(n.imageAlt, vn.imageAlt)),
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Fold the two locale dicts + asset map into the 12 BLOCK_REGISTRY blocks.
 * Calls parseBlock(kind, key, data) on each — the conformance gate.
 * Throws ZodError on any schema mismatch (fix the mapping, not the schema).
 */
export function buildBlocks(
  en: RawDict,
  vi: RawDict,
  assets: Map<string, FrozenAssetEntry>,
): BuiltBlock[] {
  const E = en as any;
  const V = vi as any;

  const dataByKey: Record<BlockKey, unknown> = {
    hero: buildHero(E, V, assets),
    features: buildFeatures(E, V, assets),
    about: buildAbout(E, V),
    productsHeader: buildProductsHeader(E, V),
    footer: buildFooter(E, V, assets),
    nav: buildNav(E, V, assets),
    meta: buildMeta(E, V, assets),
    businessContact: buildBusinessContact(E, V),
    formConfig: buildFormConfig(E, V),
    aboutPage: buildAboutPage(E, V, assets),
    contactPage: buildContactPage(E, V, assets),
    notFound: buildNotFound(E, V, assets),
  };

  // Conformance gate: parseBlock validates each block against its registry schema.
  // Throws ZodError loudly if any block doesn't conform.
  return (Object.keys(dataByKey) as BlockKey[]).map((key) => {
    const kind = BLOCK_KIND_BY_KEY[key];
    // Use 3-arg form: parseBlock(kind, key, data) — key IS the registry key (no dot prefix here).
    const validated = parseBlock(kind, key, dataByKey[key]);
    return { kind, key, data: validated };
  });
}
