import { describe, it, expect } from "vitest";
import { FrozenAsset } from "./assets";
import { ReleaseSnapshotSchema, SCHEMA_VERSION } from "./release";

const CUID = "clr1abcd0000xyz1234567890";

const MIN_ASSET = { assetId: CUID, r2Key: "originals/ab/logo.svg", mime: "image/svg+xml" };

const L = (s: string) => ({ en: s, vi: s });
const TT = (lead: string, accent: string) => ({ lead: L(lead), accent: L(accent) });
const LA = (s: string) => ({ en: [s], vi: [s] });
const ASSET = { assetId: CUID };

// A valid full block set that satisfies BLOCK_REGISTRY (all 12 keys required).
// Each sub-object matches the actual block schema in packages/shared/src/content/blocks/.
const VALID_BLOCKS = {
  hero: {
    titleTop: L("Top"),
    titleBottom: L("Bottom"),
    subtitle: L("Sub"),
    image: ASSET,
  },
  features: {
    eyebrow: L("Why"),
    title: TT("Why Brands", "Choose Us"),
    cta: { label: L("See"), href: "/products" },
    video: { title: L("Video"), text: L("Text") },
    featured: { title: L("Featured"), desc: L("Desc") },
    cards: [{ title: L("Card 1"), desc: L("Desc 1") }],
  },
  about: {
    eyebrow: L("About"),
    title: TT("About", "SIGNEX"),
    body: L("Body"),
    mission: { title: L("Mission"), body: L("Body"), items: LA("Item 1") },
    vision: { title: L("Vision"), body: L("Body") },
    values: { title: L("Values"), body: L("Body") },
  },
  productsHeader: {
    eyebrow: L("Products"),
    title: TT("Our", "Products"),
    body: L("Body"),
    statLabels: { products: L("Products"), materials: L("Materials") },
    detail: { listTitle: TT("Product", "List") },
    product: {
      categoryLabel: L("Category"),
      materialLabel: L("Material"),
      cta: L("Contact"),
      ctaHref: "/contact",
      back: L("Back"),
      zoomHint: L("Zoom"),
    },
  },
  footer: {
    tagline: LA("Tagline line"),
    contactHeading: L("Contact"),
    quickHeading: L("Quick Links"),
    links: [{ label: L("Home"), href: "/" }],
    shipLabel: L("Shipping"),
    payLabel: L("Payment"),
    payments: ["VISA"],
  },
  nav: {
    skip: L("Skip to content"),
    logo: ASSET,
    cta: { label: L("Contact"), href: "/contact" },
    links: [{ label: L("Home"), href: "/" }],
  },
  meta: {
    siteName: "SIGNEX",
    siteUrl: "https://signex.vn",
    themeColor: "#004EA2",
    title: L("SIGNEX"),
    description: L("Desc"),
    ogImage: ASSET,
    about: { title: L("About SIGNEX"), description: L("Desc") },
    contact: { title: L("Contact"), description: L("Desc") },
  },
  businessContact: {
    legalName: L("SIGNEX Co., Ltd."),
    brand: L("SIGNEX"),
    emails: ["info@signex.vn"],
    phones: [{ kind: "tel", label: L("Tel"), value: "+84900000000" }],
    taxId: "0123456789",
    taxLabel: L("Tax ID"),
    sites: [
      {
        kind: "office",
        label: L("Office"),
        address: L("123 Street, HCMC"),
      },
    ],
  },
  formConfig: {
    fields: {
      name: { label: L("Name") },
      email: { label: L("Email") },
      phone: { label: L("Phone") },
      quantity: { label: L("Qty") },
      standard: { label: L("Standard") },
      height: { label: L("Height") },
      width: { label: L("Width") },
      thickness: { label: L("Thickness") },
      upload: { label: L("Upload") },
      message: { label: L("Message") },
    },
    uploadHelp: L("Upload help"),
    standardOptions: [{ value: "A", label: L("Option A") }],
    submit: L("Submit"),
    success: L("Success"),
    fail: L("Fail"),
  },
  aboutPage: {
    hero: { title: TT("About", "SIGNEX"), subtitle: L("Sub") },
    testimonial: { title: TT("What", "They Say"), body: LA("Quote") },
    approach: [{ title: L("Approach 1"), body: LA("Point") }],
    intro: { title: TT("Intro", "Lead"), body: L("Body") },
    capability: {
      title: TT("Our", "Capabilities"),
      groups: [{ title: L("Group"), items: LA("Item") }],
      closing: LA("Closing"),
    },
    process: {
      title: TT("Our", "Process"),
      steps: [{ title: L("Step 1"), body: L("Body") }],
    },
    timeline: {
      title: TT("Our", "History"),
      intro: LA("Intro line"),
      milestones: [{ num: "2010", title: L("Founded"), body: L("Story") }],
    },
  },
  contactPage: {
    hero: { title: TT("Contact", "Us"), subtitle: L("Sub") },
    map: { eyebrow: L("Find"), title: TT("Our", "Location") },
  },
  notFound: {
    eyebrow: L("Oops"),
    title: TT("Page", "Not Found"),
    body: L("Body"),
    cta: { label: L("Back Home"), href: "/" },
    image: ASSET,
  },
};

describe("FrozenAsset", () => {
  it("requires assetId + r2Key + mime; defaults variants to []", () => {
    const out = FrozenAsset.parse(MIN_ASSET);
    expect(out.variants).toEqual([]);
  });

  it("rejects a missing r2Key", () => {
    expect(FrozenAsset.safeParse({ assetId: CUID, mime: "image/png" }).success).toBe(false);
  });

  it("accepts optional poster and webm with r2Key only", () => {
    const out = FrozenAsset.parse({
      ...MIN_ASSET,
      poster: { r2Key: "originals/ab/poster.jpg" },
      webm: { r2Key: "originals/ab/vid.webm" },
    });
    expect(out.poster?.r2Key).toBe("originals/ab/poster.jpg");
    expect(out.webm?.r2Key).toBe("originals/ab/vid.webm");
  });

  it("does NOT have a url field (URLs are never frozen)", () => {
    const keys = Object.keys(FrozenAsset.shape);
    expect(keys).not.toContain("url");
  });

  it("accepts variants array with label/width/r2Key", () => {
    const out = FrozenAsset.parse({
      ...MIN_ASSET,
      variants: [{ label: "sm", width: 400, r2Key: "originals/ab/logo-sm.webp" }],
    });
    expect(out.variants).toHaveLength(1);
    expect(out.variants[0].label).toBe("sm");
  });

  it("accepts optional localized alt", () => {
    const out = FrozenAsset.parse({ ...MIN_ASSET, alt: L("Logo") });
    expect(out.alt?.en).toBe("Logo");
  });
});

describe("ReleaseSnapshotSchema", () => {
  it("exposes SCHEMA_VERSION = 1", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it("rejects a wrong schemaVersion", () => {
    const r = ReleaseSnapshotSchema.safeParse({
      schemaVersion: 2,
      blocks: VALID_BLOCKS,
      catalog: { categories: [] },
      assets: {},
    });
    expect(r.success).toBe(false);
  });

  it("rejects when required blocks are missing (empty blocks object)", () => {
    const r = ReleaseSnapshotSchema.safeParse({
      schemaVersion: 1,
      blocks: {},
      catalog: { categories: [] },
      assets: {},
    });
    expect(r.success).toBe(false);
  });

  it("parses a minimal valid snapshot (schemaVersion 1, all blocks, empty catalog, empty assets)", () => {
    const r = ReleaseSnapshotSchema.safeParse({
      schemaVersion: 1,
      blocks: VALID_BLOCKS,
      catalog: { categories: [] },
      assets: {},
    });
    if (!r.success) console.error(JSON.stringify(r.error.format(), null, 2));
    expect(r.success).toBe(true);
  });

  it("parses a snapshot with a populated assets map (block + catalog assetIds)", () => {
    const frozenAsset = {
      assetId: CUID,
      r2Key: "originals/ab/logo.svg",
      mime: "image/svg+xml",
    };
    const r = ReleaseSnapshotSchema.safeParse({
      schemaVersion: 1,
      blocks: VALID_BLOCKS,
      catalog: { categories: [] },
      assets: { [CUID]: frozenAsset },
    });
    if (!r.success) console.error(JSON.stringify(r.error.format(), null, 2));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.assets[CUID]).toMatchObject({ r2Key: "originals/ab/logo.svg", mime: "image/svg+xml" });
      expect(r.data.assets[CUID].variants).toEqual([]);
    }
  });

  it("rejects a snapshot missing the assets map", () => {
    const r = ReleaseSnapshotSchema.safeParse({
      schemaVersion: 1,
      blocks: VALID_BLOCKS,
      catalog: { categories: [] },
      // assets intentionally omitted
    });
    expect(r.success).toBe(false);
  });

  it("rejects an assets map with a FrozenAsset missing r2Key", () => {
    const r = ReleaseSnapshotSchema.safeParse({
      schemaVersion: 1,
      blocks: VALID_BLOCKS,
      catalog: { categories: [] },
      assets: { [CUID]: { assetId: CUID, mime: "image/png" } }, // missing r2Key
    });
    expect(r.success).toBe(false);
  });

  it("parses a snapshot with one category + one product + FrozenAsset image", () => {
    const categoryImage = {
      assetId: CUID,
      r2Key: "originals/ab/cat.jpg",
      mime: "image/jpeg",
    };
    const productImage = {
      assetId: CUID,
      r2Key: "originals/ab/prod.jpg",
      mime: "image/jpeg",
    };
    const r = ReleaseSnapshotSchema.safeParse({
      schemaVersion: 1,
      blocks: VALID_BLOCKS,
      catalog: {
        categories: [
          {
            slug: "aluminum",
            sortOrder: 1,
            title: L("Aluminum"),
            tag: L("AL"),
            intro: L("Intro"),
            productCount: 18,
            materialCount: 4,
            image: categoryImage,
            items: [
              {
                slug: "alu-001",
                sortOrder: 1,
                title: L("Product 1"),
                tag: L("P1"),
                desc: L("Description"),
                image: productImage,
              },
            ],
          },
        ],
      },
      assets: { [CUID]: { assetId: CUID, r2Key: "originals/ab/cat.jpg", mime: "image/jpeg" } },
    });
    if (!r.success) console.error(JSON.stringify(r.error.format(), null, 2));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.schemaVersion).toBe(1);
      expect(r.data.catalog.categories).toHaveLength(1);
      expect(r.data.catalog.categories[0].items).toHaveLength(1);
      expect(r.data.catalog.categories[0].image?.variants).toEqual([]);
    }
  });

  it("rejects a FrozenAsset image with missing r2Key", () => {
    const r = ReleaseSnapshotSchema.safeParse({
      schemaVersion: 1,
      blocks: VALID_BLOCKS,
      catalog: {
        categories: [
          {
            slug: "aluminum",
            sortOrder: 1,
            title: L("Aluminum"),
            tag: L("AL"),
            intro: L("Intro"),
            productCount: 18,
            materialCount: 4,
            // image with missing r2Key — invalid FrozenAsset
            image: { assetId: CUID, mime: "image/jpeg" },
            items: [],
          },
        ],
      },
    });
    expect(r.success).toBe(false);
  });
});
