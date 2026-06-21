import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { BLOCK_REGISTRY, BLOCK_KEYS, parseBlock } from "./registry";
import enDict from "../../../../apps/web/app/[lang]/dictionaries/en.json";
import viDict from "../../../../apps/web/app/[lang]/dictionaries/vi.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Build a LocalizedText from both dicts using a field-accessor function. */
const lt = (en: string, vi: string) => ({ en, vi });
const lta = (en: string[], vi: string[]) => ({ en, vi });
const tt = (lead: { en: string; vi: string }, accent: { en: string; vi: string }) => ({
  lead,
  accent,
});

/**
 * A stub CUID that passes z.string().cuid() — used wherever the real dict has
 * no asset ids yet (hero image, nav logo, meta ogImage, notFound image).
 * At import time the actual asset ids are managed in the db; conformance only
 * validates the TEXT fields of those blocks.
 */
const STUB_ID = "clxxxxxxxxxxxxxxxxxxxxxxxx";
const stubAsset = (alt?: { en: string; vi: string }) =>
  alt ? { assetId: STUB_ID, alt } : { assetId: STUB_ID };

// ---------------------------------------------------------------------------
// EXPECTED_KEYS
// ---------------------------------------------------------------------------
const EXPECTED_KEYS = [
  "hero",
  "features",
  "about",
  "productsHeader",
  "footer",
  "nav",
  "meta",
  "businessContact",
  "formConfig",
  "aboutPage",
  "contactPage",
  "notFound",
];

// ---------------------------------------------------------------------------
// Brief-specified parseBlock fixture
// ---------------------------------------------------------------------------
const goodBusinessContact = {
  legalName: {
    en: "SIGNEX BRAND IDENTITY PRODUCTS MANUFACTURING CO., LTD",
    vi: "CÔNG TY TNHH SẢN XUẤT SẢN PHẨM NHẬN DIỆN THƯƠNG HIỆU SIGNEX",
  },
  brand: { en: "SIGNEX", vi: "SIGNEX" },
  emails: ["core@signex.vn", "nhuadeo@gmail.com"],
  phones: [
    { kind: "tel", label: { en: "Tel", vi: "Tel" }, value: "(+84) 979 700 072" },
    { kind: "zalo", label: { en: "Zalo", vi: "Zalo" }, value: "(+84) 94 9999 326" },
  ],
  taxId: "0319401172",
  taxLabel: { en: "Tax", vi: "Tax" },
  sites: [
    {
      kind: "office",
      label: { en: "Office", vi: "Office" },
      address: {
        en: "25/88/13 Bui Quang La, An Hoi Tay ward, Ho Chi Minh city, Viet Nam.",
        vi: "25/88/13 Bùi Quang Là, phường An Hội Tây, TP.HCM, Việt Nam.",
      },
    },
  ],
  social: [{ kind: "facebook", href: "#" }],
};

// ---------------------------------------------------------------------------
// BLOCK_REGISTRY tests (from brief)
// ---------------------------------------------------------------------------
describe("BLOCK_REGISTRY", () => {
  it("has exactly the 12 expected keys", () => {
    expect(Object.keys(BLOCK_REGISTRY).sort()).toEqual([...EXPECTED_KEYS].sort());
    expect(BLOCK_KEYS.length).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// parseBlock tests (from brief)
// ---------------------------------------------------------------------------
describe("parseBlock", () => {
  it("returns the parsed value for valid data", () => {
    const out = parseBlock("businessContact", goodBusinessContact);
    expect(out.taxId).toBe("0319401172");
    expect(out.phones[0].kind).toBe("tel");
  });

  it("throws a ZodError when data violates the schema", () => {
    expect(() =>
      parseBlock("businessContact", { ...goodBusinessContact, emails: ["not-an-email"] }),
    ).toThrow(ZodError);
    expect(() => parseBlock("hero", {})).toThrow(ZodError);
  });

  it("is keyed by registry schema (footer rejects missing payments)", () => {
    expect(() =>
      parseBlock("footer", {
        tagline: { en: ["a", "b"], vi: ["x", "y"] },
        contactHeading: { en: "Contact us", vi: "Liên hệ" },
        quickHeading: { en: "Quick links", vi: "Truy cập nhanh" },
        links: [{ label: { en: "Home", vi: "Trang chủ" }, href: "/" }],
        shipLabel: { en: "We ship with:", vi: "Hình thức giao hàng:" },
        payLabel: { en: "Payment options:", vi: "Phương thức thanh toán:" },
        // payments missing -> ZodError
      }),
    ).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// Real-dict conformance
//
// Approach:
//   • Blocks whose schema IS a 1-to-1 subset of the flat dict shape are
//     constructed directly from {en, vi} pairs built from both dict files.
//   • Blocks with promoted literals (AssetRef, VideoRef, siteUrl, themeColor)
//     use STUB_ID for asset ids and placeholder strings for the static values —
//     conformance validates the TEXT shape; the actual ids are seeded by the
//     importer (Task 57).
//   • businessContact is UNIFIED NAP: constructed from footer NAP fields
//     present in both dict files (en.json + vi.json).
// ---------------------------------------------------------------------------
describe("dict conformance: all 12 blocks", () => {
  // ---- 1. hero ----------------------------------------------------------------
  it("hero: text fields conform (image stubbed)", () => {
    const fixture = {
      titleTop: lt(enDict.hero.titleTop, viDict.hero.titleTop),
      titleBottom: lt(enDict.hero.titleBottom, viDict.hero.titleBottom),
      subtitle: lt(enDict.hero.subtitle, viDict.hero.subtitle),
      // imageAlt → AssetRef; real id comes from importer; stub for conformance
      image: stubAsset(lt(enDict.hero.imageAlt, viDict.hero.imageAlt)),
    };
    expect(BLOCK_REGISTRY.hero.safeParse(fixture).success).toBe(true);
  });

  // ---- 2. features ------------------------------------------------------------
  it("features: text fields conform (video.media omitted)", () => {
    const en = enDict.features;
    const vi = viDict.features;
    const fixture = {
      eyebrow: lt(en.eyebrow, vi.eyebrow),
      title: tt(
        lt(en.titleTop, vi.titleTop),
        lt(en.titleBottom, vi.titleBottom),
      ),
      cta: {
        label: lt(en.cta, vi.cta),
        href: "/contact", // promoted literal
      },
      video: {
        title: lt(en.videoTitle, vi.videoTitle),
        text: lt(en.videoText, vi.videoText),
        // media is optional — no video asset ids in dict yet
      },
      featured: {
        title: lt(en.featured.title, vi.featured.title),
        desc: lt(en.featured.desc, vi.featured.desc),
      },
      cards: en.cards.map((card, i) => ({
        title: lt(card.title, vi.cards[i].title),
        desc: lt(card.desc, vi.cards[i].desc),
      })),
    };
    expect(BLOCK_REGISTRY.features.safeParse(fixture).success).toBe(true);
  });

  // ---- 3. about ---------------------------------------------------------------
  it("about: conforms to dict.about with TwoToneTitle mapping", () => {
    const en = enDict.about;
    const vi = viDict.about;
    const fixture = {
      eyebrow: lt(en.eyebrow, vi.eyebrow),
      title: tt(lt(en.title, vi.title), lt(en.titleAccent, vi.titleAccent)),
      body: lt(en.body, vi.body),
      mission: {
        title: lt(en.mission.title, vi.mission.title),
        body: lt(en.mission.body, vi.mission.body),
        items: lta(en.mission.items, vi.mission.items),
      },
      vision: {
        title: lt(en.vision.title, vi.vision.title),
        body: lt(en.vision.body, vi.vision.body),
      },
      values: {
        title: lt(en.values.title, vi.values.title),
        body: lt(en.values.body, vi.values.body),
      },
    };
    expect(BLOCK_REGISTRY.about.safeParse(fixture).success).toBe(true);
  });

  // ---- 4. productsHeader ------------------------------------------------------
  it("productsHeader: conforms to dict.products UI copy (ctaHref promoted)", () => {
    const en = enDict.products;
    const vi = viDict.products;
    const fixture = {
      eyebrow: lt(en.eyebrow, vi.eyebrow),
      title: tt(lt(en.title, vi.title), lt(en.titleAccent, vi.titleAccent)),
      body: lt(en.body, vi.body),
      statLabels: {
        products: lt(en.statLabels.products, vi.statLabels.products),
        materials: lt(en.statLabels.materials, vi.statLabels.materials),
      },
      detail: {
        listTitle: tt(
          lt(en.detail.listTitle, vi.detail.listTitle),
          lt(en.detail.listTitleAccent, vi.detail.listTitleAccent),
        ),
      },
      product: {
        categoryLabel: lt(en.product.categoryLabel, vi.product.categoryLabel),
        materialLabel: lt(en.product.materialLabel, vi.product.materialLabel),
        cta: lt(en.product.cta, vi.product.cta),
        ctaHref: "/contact", // promoted literal — hardcoded in JSX
        back: lt(en.product.back, vi.product.back),
        zoomHint: lt(en.product.zoomHint, vi.product.zoomHint),
      },
    };
    expect(BLOCK_REGISTRY.productsHeader.safeParse(fixture).success).toBe(true);
  });

  // ---- 5. footer --------------------------------------------------------------
  it("footer: conforms to dict.footer (NAP excluded — lives in businessContact)", () => {
    const en = enDict.footer;
    const vi = viDict.footer;
    const fixture = {
      tagline: lta(en.tagline, vi.tagline),
      contactHeading: lt(en.contactHeading, vi.contactHeading),
      quickHeading: lt(en.quickHeading, vi.quickHeading),
      links: en.links.map((link, i) => ({
        label: lt(link.label, vi.links[i].label),
        href: link.href,
      })),
      shipLabel: lt(en.shipLabel, vi.shipLabel),
      payLabel: lt(en.payLabel, vi.payLabel),
      // en has VISA/JCB/Napas; vi has VISA/COD/Napas — use en (locale-invariant brand codes)
      payments: en.payments,
    };
    expect(BLOCK_REGISTRY.footer.safeParse(fixture).success).toBe(true);
  });

  // ---- 6. nav -----------------------------------------------------------------
  it("nav: text fields conform (logo stubbed)", () => {
    const en = enDict.nav;
    const vi = viDict.nav;
    const fixture = {
      skip: lt(en.skip, vi.skip),
      // logo is a promoted literal (/assets/logo.svg) with no dict entry; stub id
      logo: stubAsset(lt("SIGNEX", "SIGNEX")),
      cta: {
        label: lt(en.cta, vi.cta),
        href: "/contact", // promoted literal
      },
      links: en.links.map((link, i) => ({
        label: lt(link.label, vi.links[i].label),
        href: link.href,
      })),
    };
    expect(BLOCK_REGISTRY.nav.safeParse(fixture).success).toBe(true);
  });

  // ---- 7. meta ----------------------------------------------------------------
  it("meta: text fields conform (ogImage/favicons/siteUrl/themeColor stubbed)", () => {
    const en = enDict.meta;
    const vi = viDict.meta;
    const fixture = {
      siteName: en.siteName, // locale-invariant
      siteUrl: "https://signex.vn", // promoted literal
      themeColor: "#003087", // promoted literal
      title: lt(en.title, vi.title),
      description: lt(en.description, vi.description),
      ogImage: stubAsset(lt(en.ogImageAlt, vi.ogImageAlt)),
      // favicons are promoted literals; default [] is fine
      about: {
        title: lt(en.about.title, vi.about.title),
        description: lt(en.about.description, vi.about.description),
      },
      contact: {
        title: lt(en.contact.title, vi.contact.title),
        description: lt(en.contact.description, vi.contact.description),
      },
    };
    expect(BLOCK_REGISTRY.meta.safeParse(fixture).success).toBe(true);
  });

  // ---- 8. businessContact -----------------------------------------------------
  it("businessContact: unified NAP from dict footer/contact fields", () => {
    // NAP fields live scattered across en.footer and vi.footer; they are
    // unified into this single block so the importer only seeds once.
    const enF = enDict.footer;
    const viF = viDict.footer;
    const fixture = {
      legalName: lt(enF.company, viF.company),
      brand: lt("SIGNEX", "SIGNEX"), // locale-invariant brand short name
      emails: [enF.email], // locale-invariant
      phones: [
        { kind: "tel" as const, label: lt("Tel", "Tel"), value: enF.tel },
        { kind: "zalo" as const, label: lt("Zalo", "Zalo"), value: enF.zalo },
      ],
      taxId: enF.tax, // locale-invariant
      taxLabel: lt("Tax", "Tax"),
      sites: [
        {
          kind: "office" as const,
          label: lt("Office", "Office"),
          address: lt(enF.office, viF.office),
        },
        {
          kind: "factory" as const,
          label: lt("Factory", "Factory"),
          address: lt(enF.factory, viF.factory),
        },
      ],
      social: [{ kind: "facebook" as const, href: "#" }], // seed placeholder
    };
    expect(BLOCK_REGISTRY.businessContact.safeParse(fixture).success).toBe(true);
  });

  // ---- 9. formConfig ----------------------------------------------------------
  it("formConfig: conforms to dict.form (standardOptions promoted to {value,label})", () => {
    const en = enDict.form;
    const vi = viDict.form;
    const field = (enLabel: string, viLabel: string, enPlaceholder?: string, viPlaceholder?: string) => ({
      label: lt(enLabel, viLabel),
      ...(enPlaceholder != null && viPlaceholder != null
        ? { placeholder: lt(enPlaceholder, viPlaceholder) }
        : {}),
    });
    const fixture = {
      fields: {
        name: field(en.name, vi.name, en.namePlaceholder, vi.namePlaceholder),
        email: field(en.email, vi.email, en.emailPlaceholder, vi.emailPlaceholder),
        phone: field(en.phone, vi.phone, en.phonePlaceholder, vi.phonePlaceholder),
        quantity: field(en.quantity, vi.quantity, en.quantityPlaceholder, vi.quantityPlaceholder),
        standard: field(en.standard, vi.standard, en.standardPlaceholder, vi.standardPlaceholder),
        height: field(en.height, vi.height, en.heightPlaceholder, vi.heightPlaceholder),
        width: field(en.width, vi.width, en.widthPlaceholder, vi.widthPlaceholder),
        thickness: field(en.thickness, vi.thickness, en.thicknessPlaceholder, vi.thicknessPlaceholder),
        upload: field(en.upload, vi.upload),
        message: field(en.message, vi.message, en.messagePlaceholder, vi.messagePlaceholder),
      },
      uploadHelp: lt(en.uploadHelp, vi.uploadHelp),
      // dict has a flat string[] for standardOptions; block expects {value,label}
      // The value is the locale-invariant option key (same as en string).
      standardOptions: en.standardOptions.map((opt, i) => ({
        value: opt, // locale-invariant (en string used as key)
        label: lt(opt, vi.standardOptions[i]),
      })),
      submit: lt(en.submit, vi.submit),
      success: lt(en.success, vi.success),
      fail: lt(en.fail, vi.fail),
    };
    expect(BLOCK_REGISTRY.formConfig.safeParse(fixture).success).toBe(true);
  });

  // ---- 10. aboutPage ----------------------------------------------------------
  it("aboutPage: conforms to dict.aboutPage with TwoToneTitle mapping", () => {
    const en = enDict.aboutPage;
    const vi = viDict.aboutPage;
    const fixture = {
      hero: {
        title: tt(lt(en.hero.title, vi.hero.title), lt(en.hero.titleAccent, vi.hero.titleAccent)),
        subtitle: lt(en.hero.subtitle, vi.hero.subtitle),
      },
      testimonial: {
        eyebrow: lt(en.testimonial.eyebrow, vi.testimonial.eyebrow),
        title: tt(
          lt(en.testimonial.title, vi.testimonial.title),
          lt(en.testimonial.titleAccent, vi.testimonial.titleAccent),
        ),
        body: lta(en.testimonial.body, vi.testimonial.body),
      },
      approach: en.approach.map((item, i) => ({
        title: lt(item.title, vi.approach[i].title),
        body: lta(item.body, vi.approach[i].body),
      })),
      intro: {
        eyebrow: lt(en.intro.eyebrow, vi.intro.eyebrow),
        title: tt(lt(en.intro.title, vi.intro.title), lt(en.intro.titleAccent, vi.intro.titleAccent)),
        body: lt(en.intro.body, vi.intro.body),
      },
      capability: {
        eyebrow: lt(en.capability.eyebrow, vi.capability.eyebrow),
        title: tt(
          lt(en.capability.title, vi.capability.title),
          lt(en.capability.titleAccent, vi.capability.titleAccent),
        ),
        body: lt(en.capability.body, vi.capability.body),
        groups: en.capability.groups.map((g, i) => ({
          title: lt(g.title, vi.capability.groups[i].title),
          items: lta(g.items, vi.capability.groups[i].items),
        })),
        closing: lta(en.capability.closing, vi.capability.closing),
      },
      process: {
        eyebrow: lt(en.process.eyebrow, vi.process.eyebrow),
        title: tt(lt(en.process.title, vi.process.title), lt(en.process.titleAccent, vi.process.titleAccent)),
        body: lt(en.process.body, vi.process.body),
        steps: en.process.steps.map((s, i) => ({
          title: lt(s.title, vi.process.steps[i].title),
          body: lt(s.body, vi.process.steps[i].body),
        })),
      },
      timeline: {
        eyebrow: lt(en.timeline.eyebrow, vi.timeline.eyebrow),
        title: tt(
          lt(en.timeline.title, vi.timeline.title),
          lt(en.timeline.titleAccent, vi.timeline.titleAccent),
        ),
        body: lt(en.timeline.body, vi.timeline.body),
        intro: lta(en.timeline.intro, vi.timeline.intro),
        milestones: en.timeline.milestones.map((m, i) => {
          const vim = vi.timeline.milestones[i];
          return {
            num: m.num,
            title: lt(m.title, vim.title),
            body: lt(m.body, vim.body),
            ...(m.items ? { items: lta(m.items, (vim as typeof m).items ?? []) } : {}),
            ...(m.note ? { note: lt(m.note, (vim as typeof m).note ?? "") } : {}),
          };
        }),
      },
    };
    expect(BLOCK_REGISTRY.aboutPage.safeParse(fixture).success).toBe(true);
  });

  // ---- 11. contactPage --------------------------------------------------------
  it("contactPage: conforms to dict.contactPage (NAP cards excluded — in businessContact)", () => {
    const en = enDict.contactPage;
    const vi = viDict.contactPage;
    const fixture = {
      hero: {
        title: tt(lt(en.hero.title, vi.hero.title), lt(en.hero.titleAccent, vi.hero.titleAccent)),
        subtitle: lt(en.hero.subtitle, vi.hero.subtitle),
      },
      map: {
        eyebrow: lt(en.map.eyebrow, vi.map.eyebrow),
        title: tt(lt(en.map.title, vi.map.title), lt(en.map.titleAccent, vi.map.titleAccent)),
      },
    };
    expect(BLOCK_REGISTRY.contactPage.safeParse(fixture).success).toBe(true);
  });

  // ---- 12. notFound -----------------------------------------------------------
  it("notFound: text fields conform (image stubbed)", () => {
    const en = enDict.notFound;
    const vi = viDict.notFound;
    const fixture = {
      eyebrow: lt(en.eyebrow, vi.eyebrow),
      title: tt(lt(en.title, vi.title), lt(en.titleAccent, vi.titleAccent)),
      body: lt(en.body, vi.body),
      cta: {
        label: lt(en.cta, vi.cta),
        href: "/", // promoted literal
      },
      // imageAlt → AssetRef; real id seeded by importer; stub for conformance
      image: stubAsset(lt(en.imageAlt, vi.imageAlt)),
    };
    expect(BLOCK_REGISTRY.notFound.safeParse(fixture).success).toBe(true);
  });
});
