import { BLOCK_REGISTRY } from '@signex/shared';

/**
 * Minimal valid sample for every block in the registry, generated so the
 * serializer unit test always covers the full BLOCK_REGISTRY key-set.
 * The real shapes are exercised end-to-end by the importer conformance test.
 */
const L = { en: 'x', vi: 'x' };
const LA = { en: ['x'], vi: ['x'] };
const TT = { lead: L, accent: L };
const AREF = { assetId: 'clqt5s0000000000000000001' };
const formField = { label: L, placeholder: L, required: false };

export const BLOCK_FIXTURES: Record<string, unknown> = {
  hero: {
    titleTop: L,
    titleBottom: L,
    subtitle: L,
    image: AREF,
  },
  features: {
    eyebrow: L,
    title: TT,
    cta: { label: L, href: '#' },
    video: { title: L, text: L },
    featured: { title: L, desc: L },
    cards: [{ title: L, desc: L }],
  },
  about: {
    eyebrow: L,
    title: TT,
    body: L,
    mission: { title: L, body: L, items: LA },
    vision: { title: L, body: L },
    values: { title: L, body: L },
  },
  productsHeader: {
    eyebrow: L,
    title: TT,
    body: L,
    statLabels: { products: L, materials: L },
    detail: { listTitle: TT },
    product: {
      categoryLabel: L,
      materialLabel: L,
      cta: L,
      ctaHref: '#',
      back: L,
      zoomHint: L,
    },
  },
  footer: {
    tagline: LA,
    contactHeading: L,
    quickHeading: L,
    links: [{ label: L, href: '#' }],
    shipLabel: L,
    payLabel: L,
    payments: ['VISA'],
  },
  nav: {
    skip: L,
    logo: AREF,
    cta: { label: L, href: '#' },
    links: [{ label: L, href: '#' }],
  },
  meta: {
    siteName: 'SIGNEX',
    siteUrl: 'https://signex.example',
    themeColor: '#000',
    title: L,
    description: L,
    ogImage: AREF,
    favicons: [],
    about: { title: L, description: L },
    contact: { title: L, description: L },
  },
  businessContact: {
    legalName: L,
    brand: L,
    emails: ['a@b.com'],
    phones: [{ kind: 'tel', label: L, value: '+84' }],
    taxId: '123',
    taxLabel: L,
    sites: [{ kind: 'office', label: L, address: L }],
    social: [{ kind: 'facebook', href: '#' }],
  },
  formConfig: {
    fields: {
      name: formField,
      email: formField,
      phone: formField,
      quantity: formField,
      standard: formField,
      height: formField,
      width: formField,
      thickness: formField,
      upload: formField,
      message: formField,
    },
    uploadHelp: L,
    standardOptions: [{ value: 'opt1', label: L }],
    submit: L,
    success: L,
    fail: L,
  },
  aboutPage: {
    hero: { title: TT, subtitle: L },
    testimonial: { title: TT, body: LA },
    approach: [{ title: L, body: LA }],
    intro: { title: TT },
    capability: {
      title: TT,
      groups: [{ title: L, items: LA }],
      closing: LA,
    },
    process: {
      title: TT,
      steps: [{ title: L, body: L }],
    },
    timeline: {
      title: TT,
      intro: LA,
      milestones: [{ num: '2010', title: L, body: L }],
    },
  },
  contactPage: {
    hero: { title: TT, subtitle: L },
    map: { eyebrow: L, title: TT },
  },
  notFound: {
    eyebrow: L,
    title: TT,
    body: L,
    cta: { label: L, href: '#' },
    image: AREF,
  },
};

// Hard fail at module load if a registry key has no fixture, so a new block
// can never silently skip serializer coverage.
for (const key of Object.keys(BLOCK_REGISTRY)) {
  if (!(key in BLOCK_FIXTURES)) {
    throw new Error(`blocks.fixture: missing fixture for block "${key}"`);
  }
}
