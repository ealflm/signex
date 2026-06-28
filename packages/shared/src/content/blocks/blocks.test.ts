import { describe, it, expect } from "vitest";
import {
  heroBlock,
  featuresBlock,
  aboutBlock,
  productsHeaderBlock,
  footerBlock,
  navBlock,
  metaBlock,
  businessContactBlock,
  formConfigBlock,
  aboutPageBlock,
  contactPageBlock,
  notFoundBlock,
  resolveBusinessContact,
  siteConfigSchema,
} from "./index";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const lt = (en: string, vi: string) => ({ en, vi });
const lta = (en: string[], vi: string[]) => ({ en, vi });
const twoTone = (lead: { en: string; vi: string }, accent: { en: string; vi: string }) => ({
  lead,
  accent,
});
const cuid = () => "clxxxxxxxxxxxxxxxxxxxxxxxx"; // fake but cuid-shaped for tests

// ---------------------------------------------------------------------------
// 1. heroBlock
// ---------------------------------------------------------------------------
describe("heroBlock", () => {
  const valid = {
    titleTop: lt("Sign", "Biển"),
    titleBottom: lt("EX", "Hiệu"),
    subtitle: lt("Premium signage", "Biển hiệu cao cấp"),
    image: { assetId: cuid(), alt: lt("Hero image", "Ảnh hero") },
  };

  it("parses a valid hero", () => {
    expect(heroBlock.safeParse(valid).success).toBe(true);
  });

  it("accepts image without alt (alt is optional)", () => {
    const d = { ...valid, image: { assetId: cuid() } };
    expect(heroBlock.safeParse(d).success).toBe(true);
  });

  it("rejects missing titleTop", () => {
    const { titleTop: _, ...d } = valid;
    expect(heroBlock.safeParse(d).success).toBe(false);
  });

  it("rejects non-cuid assetId", () => {
    const d = { ...valid, image: { assetId: "not-a-cuid", alt: lt("x", "x") } };
    expect(heroBlock.safeParse(d).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. featuresBlock
// ---------------------------------------------------------------------------
describe("featuresBlock", () => {
  const validCard = { title: lt("Speed", "Tốc độ"), desc: lt("Fast", "Nhanh") };
  const valid = {
    eyebrow: lt("Why", "Tại sao"),
    title: twoTone(lt("Lead", "Chính"), lt("Accent", "Nhấn")),
    cta: { label: lt("Learn more", "Xem thêm"), href: "/contact" },
    video: { title: lt("Video", "Video"), text: lt("Watch", "Xem") },
    featured: validCard,
    cards: [validCard],
  };

  it("parses valid features (video.media omitted)", () => {
    expect(featuresBlock.safeParse(valid).success).toBe(true);
  });

  it("parses features with featured.image present (optional AssetRef)", () => {
    const d = {
      ...valid,
      featured: { ...validCard, image: { assetId: cuid(), alt: lt("Still", "Ảnh") } },
    };
    expect(featuresBlock.safeParse(d).success).toBe(true);
  });

  it("parses features without featured.image (image is optional)", () => {
    // validCard has no image — confirms the field is optional (back-compat w/ v1 snapshot).
    expect("image" in valid.featured).toBe(false);
    expect(featuresBlock.safeParse(valid).success).toBe(true);
  });

  it("rejects features with non-cuid featured.image.assetId", () => {
    const d = { ...valid, featured: { ...validCard, image: { assetId: "bad" } } };
    expect(featuresBlock.safeParse(d).success).toBe(false);
  });

  it("parses features with video.media present", () => {
    const d = {
      ...valid,
      video: {
        ...valid.video,
        media: { posterAssetId: cuid(), mp4AssetId: cuid() },
      },
    };
    expect(featuresBlock.safeParse(d).success).toBe(true);
  });

  it("rejects empty cards array", () => {
    expect(featuresBlock.safeParse({ ...valid, cards: [] }).success).toBe(false);
  });

  it("rejects title without accent (TwoToneTitle requires both lead+accent)", () => {
    const bad = { ...valid, title: { lead: lt("Only", "Chỉ") } };
    expect(featuresBlock.safeParse(bad).success).toBe(false);
  });

  it("rejects missing eyebrow", () => {
    const { eyebrow: _, ...d } = valid;
    expect(featuresBlock.safeParse(d).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. aboutBlock
// ---------------------------------------------------------------------------
describe("aboutBlock", () => {
  const valid = {
    eyebrow: lt("About", "Về"),
    title: twoTone(lt("About ", "Về "), lt("SIGNEX", "SIGNEX")),
    body: lt("We are...", "Chúng tôi..."),
    mission: {
      title: lt("Mission", "Sứ mệnh"),
      body: lt("Our mission", "Sứ mệnh của chúng tôi"),
      items: lta(["item1"], ["mục1"]),
    },
    vision: { title: lt("Vision", "Tầm nhìn"), body: lt("Our vision", "Tầm nhìn") },
    values: { title: lt("Values", "Giá trị"), body: lt("Our values", "Giá trị") },
  };

  it("parses a valid about block", () => {
    expect(aboutBlock.safeParse(valid).success).toBe(true);
  });

  it("rejects missing vision", () => {
    const { vision: _, ...d } = valid;
    expect(aboutBlock.safeParse(d).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. productsHeaderBlock
// ---------------------------------------------------------------------------
describe("productsHeaderBlock", () => {
  const valid = {
    eyebrow: lt("Products", "Sản phẩm"),
    title: twoTone(lt("Our ", ""), lt("Products", "Sản phẩm")),
    body: lt("We make...", "Chúng tôi..."),
    statLabels: {
      products: lt("Products", "Sản phẩm"),
      materials: lt("Materials", "Vật liệu"),
    },
    detail: {
      listTitle: twoTone(lt("Choose ", "Chọn "), lt("Material", "Vật liệu")),
    },
    product: {
      categoryLabel: lt("Category", "Danh mục"),
      materialLabel: lt("Material", "Vật liệu"),
      cta: lt("Contact us", "Liên hệ"),
      ctaHref: "/contact",
      back: lt("Back", "Quay lại"),
      zoomHint: lt("Click to zoom", "Nhấn để phóng to"),
    },
  };

  it("parses a valid productsHeader block", () => {
    expect(productsHeaderBlock.safeParse(valid).success).toBe(true);
  });

  it("rejects missing statLabels", () => {
    const { statLabels: _, ...d } = valid;
    expect(productsHeaderBlock.safeParse(d).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. footerBlock
// ---------------------------------------------------------------------------
describe("footerBlock", () => {
  const valid = {
    tagline: lta(["Line 1", "Line 2"], ["Dòng 1", "Dòng 2"]),
    contactHeading: lt("Contact", "Liên hệ"),
    quickHeading: lt("Quick Links", "Liên kết nhanh"),
    links: [{ label: lt("Home", "Trang chủ"), href: "/" }],
    shipLabel: lt("Shipping", "Giao hàng"),
    payLabel: lt("Payment", "Thanh toán"),
    payments: ["VISA", "JCB"],
  };

  it("parses a valid footer block", () => {
    expect(footerBlock.safeParse(valid).success).toBe(true);
  });

  it("parses a footer with logo present (optional AssetRef)", () => {
    const d = { ...valid, logo: { assetId: cuid(), alt: lt("Logo", "Logo") } };
    expect(footerBlock.safeParse(d).success).toBe(true);
  });

  it("parses a footer without logo (logo is optional → v1 snapshot stays valid)", () => {
    expect("logo" in valid).toBe(false);
    expect(footerBlock.safeParse(valid).success).toBe(true);
  });

  it("rejects footer with non-cuid logo.assetId", () => {
    const d = { ...valid, logo: { assetId: "bad" } };
    expect(footerBlock.safeParse(d).success).toBe(false);
  });

  it("rejects empty links", () => {
    expect(footerBlock.safeParse({ ...valid, links: [] }).success).toBe(false);
  });

  it("rejects empty payments", () => {
    expect(footerBlock.safeParse({ ...valid, payments: [] }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. navBlock
// ---------------------------------------------------------------------------
describe("navBlock", () => {
  const valid = {
    skip: lt("Skip to content", "Bỏ qua nội dung"),
    logo: { assetId: cuid(), alt: lt("SIGNEX logo", "Logo SIGNEX") },
    cta: { label: lt("Get Quote", "Báo giá"), href: "/contact" },
    links: [{ label: lt("Home", "Trang chủ"), href: "/" }],
  };

  it("parses a valid nav block", () => {
    expect(navBlock.safeParse(valid).success).toBe(true);
  });

  it("rejects empty links", () => {
    expect(navBlock.safeParse({ ...valid, links: [] }).success).toBe(false);
  });

  it("rejects invalid logo assetId", () => {
    const d = { ...valid, logo: { assetId: "bad", alt: lt("Logo", "Logo") } };
    expect(navBlock.safeParse(d).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. metaBlock
// ---------------------------------------------------------------------------
describe("metaBlock", () => {
  const valid = {
    siteName: "SIGNEX",
    siteUrl: "https://signex.vn",
    themeColor: "#003087",
    title: lt("SIGNEX | Premium Signage", "SIGNEX | Biển hiệu cao cấp"),
    description: lt("We make signs", "Chúng tôi làm biển"),
    ogImage: { assetId: cuid(), alt: lt("OG image", "Ảnh OG") },
    about: {
      title: lt("About SIGNEX", "Về SIGNEX"),
      description: lt("About us", "Về chúng tôi"),
    },
    contact: {
      title: lt("Contact SIGNEX", "Liên hệ SIGNEX"),
      description: lt("Contact us", "Liên hệ với chúng tôi"),
    },
  };

  it("parses a valid meta block (favicons defaults to [])", () => {
    expect(metaBlock.safeParse(valid).success).toBe(true);
  });

  it("parses with explicit favicons", () => {
    const d = {
      ...valid,
      favicons: [{ rel: "icon", asset: { assetId: cuid() } }],
    };
    expect(metaBlock.safeParse(d).success).toBe(true);
  });

  it("rejects non-URL siteUrl", () => {
    expect(metaBlock.safeParse({ ...valid, siteUrl: "not-a-url" }).success).toBe(false);
  });

  it("rejects invalid ogImage assetId", () => {
    const d = { ...valid, ogImage: { assetId: "bad", alt: lt("x", "x") } };
    expect(metaBlock.safeParse(d).success).toBe(false);
  });

  // GA4/analytics moved OUT of meta to the global SiteConfig (see siteConfigSchema below). meta is
  // non-strict, so a v1/v2 snapshot that still carries `meta.analytics` parses (the key is stripped).
  it("parses WITHOUT analytics (analytics no longer lives in meta)", () => {
    const r = metaBlock.safeParse(valid);
    expect(r.success).toBe(true);
    expect(r.success && (r.data as { analytics?: unknown }).analytics).toBeUndefined();
  });

  it("strips a legacy analytics key from an old snapshot (non-strict)", () => {
    const r = metaBlock.safeParse({ ...valid, analytics: { ga4Id: "G-ABC1234XYZ" } });
    expect(r.success).toBe(true);
    expect(r.success && (r.data as { analytics?: unknown }).analytics).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7b. siteConfigSchema (global SiteConfig — GA4 lives here now, not in meta)
// ---------------------------------------------------------------------------
describe("siteConfigSchema", () => {
  it("parses a valid GA4 id", () => {
    expect(siteConfigSchema.safeParse({ ga4Id: "G-ABC1234XYZ" }).success).toBe(true);
  });

  it("parses an empty ga4Id (treated as unset)", () => {
    expect(siteConfigSchema.safeParse({ ga4Id: "" }).success).toBe(true);
  });

  it("parses an absent ga4Id (optional)", () => {
    expect(siteConfigSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a malformed GA4 id", () => {
    expect(siteConfigSchema.safeParse({ ga4Id: "UA-12345" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. businessContactBlock + resolveBusinessContact
// ---------------------------------------------------------------------------
describe("businessContactBlock", () => {
  const valid = {
    legalName: lt("Signex Co., Ltd.", "Công ty TNHH Signex"),
    brand: lt("SIGNEX", "SIGNEX"),
    emails: ["info@signex.vn"],
    phones: [
      { kind: "tel" as const, label: lt("Tel", "Điện thoại"), value: "+84-900-000-000" },
      { kind: "zalo" as const, label: lt("Zalo", "Zalo"), value: "+84-900-000-001" },
    ],
    taxId: "0123456789",
    taxLabel: lt("Tax ID", "Mã số thuế"),
    sites: [
      {
        kind: "office" as const,
        label: lt("Office", "Văn phòng"),
        address: lt("123 Street, Hanoi", "123 Phố, Hà Nội"),
        mapEmbedUrl: "https://maps.google.com/?q=123",
      },
    ],
    social: [
      { kind: "facebook" as const, href: "https://facebook.com/signex" },
      { kind: "youtube" as const, href: "#" },
    ],
  };

  it("parses a valid businessContact block", () => {
    expect(businessContactBlock.safeParse(valid).success).toBe(true);
  });

  it("social defaults to [] when omitted", () => {
    const { social: _, ...d } = valid;
    const result = businessContactBlock.safeParse(d);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.social).toEqual([]);
  });

  it("rejects invalid email format", () => {
    const d = { ...valid, emails: ["not-an-email"] };
    expect(businessContactBlock.safeParse(d).success).toBe(false);
  });

  it("rejects empty phones array", () => {
    expect(businessContactBlock.safeParse({ ...valid, phones: [] }).success).toBe(false);
  });

  it("rejects unknown phone kind", () => {
    const d = {
      ...valid,
      phones: [{ kind: "whatsapp", label: lt("WA", "WA"), value: "123" }],
    };
    expect(businessContactBlock.safeParse(d).success).toBe(false);
  });

  it("rejects legalName as plain string (must be localized)", () => {
    const d = { ...valid, legalName: "Signex Co" };
    expect(businessContactBlock.safeParse(d).success).toBe(false);
  });

  it("rejects taxId as localized object (must be scalar)", () => {
    const d = { ...valid, taxId: { en: "123", vi: "123" } };
    expect(businessContactBlock.safeParse(d).success).toBe(false);
  });

  describe("resolveBusinessContact", () => {
    it("returns phoneLines in en", () => {
      const bc = businessContactBlock.parse(valid);
      const resolved = resolveBusinessContact(bc, "en");
      expect(resolved.phoneLines).toEqual(["Tel: +84-900-000-000", "Zalo: +84-900-000-001"]);
    });

    it("returns phoneLines in vi", () => {
      const bc = businessContactBlock.parse(valid);
      const resolved = resolveBusinessContact(bc, "vi");
      expect(resolved.phoneLines).toEqual(["Điện thoại: +84-900-000-000", "Zalo: +84-900-000-001"]);
    });

    it("filters '#' from sameAs", () => {
      const bc = businessContactBlock.parse(valid);
      const resolved = resolveBusinessContact(bc, "en");
      expect(resolved.sameAs).toEqual(["https://facebook.com/signex"]);
    });

    it("returns addressLines", () => {
      const bc = businessContactBlock.parse(valid);
      const resolved = resolveBusinessContact(bc, "en");
      expect(resolved.addressLines).toEqual(["Office: 123 Street, Hanoi"]);
    });
  });
});

// ---------------------------------------------------------------------------
// 9. formConfigBlock
// ---------------------------------------------------------------------------
describe("formConfigBlock", () => {
  const field = (label: string) => ({
    label: lt(label, label),
    placeholder: lt(`Enter ${label}`, `Nhập ${label}`),
    required: true,
  });
  const valid = {
    fields: {
      name: field("Name"),
      email: field("Email"),
      phone: field("Phone"),
      quantity: field("Quantity"),
      standard: field("Standard"),
      height: field("Height"),
      width: field("Width"),
      thickness: field("Thickness"),
      upload: field("Upload"),
      message: field("Message"),
    },
    uploadHelp: lt("Max 5MB", "Tối đa 5MB"),
    standardOptions: [
      { value: "A1", label: lt("A1 (594×841mm)", "A1 (594×841mm)") },
    ],
    submit: lt("Submit", "Gửi"),
    success: lt("Sent!", "Đã gửi!"),
    fail: lt("Error", "Lỗi"),
  };

  it("parses a valid formConfig block", () => {
    expect(formConfigBlock.safeParse(valid).success).toBe(true);
  });

  it("required defaults to false when omitted", () => {
    const d = {
      ...valid,
      fields: { ...valid.fields, name: { label: lt("Name", "Tên") } },
    };
    const result = formConfigBlock.safeParse(d);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fields.name.required).toBe(false);
  });

  it("rejects empty standardOptions", () => {
    expect(formConfigBlock.safeParse({ ...valid, standardOptions: [] }).success).toBe(false);
  });

  it("rejects missing message field", () => {
    const { message: _, ...fields } = valid.fields;
    expect(formConfigBlock.safeParse({ ...valid, fields }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. aboutPageBlock
// ---------------------------------------------------------------------------
describe("aboutPageBlock", () => {
  const step = { title: lt("Step", "Bước"), body: lt("Do X", "Làm X") };
  const milestone = {
    num: "2010",
    title: lt("Founded", "Thành lập"),
    body: lt("We started", "Chúng tôi bắt đầu"),
  };
  const valid = {
    hero: {
      title: twoTone(lt("Who ", "Chúng "), lt("We Are", "Tôi Là")),
      subtitle: lt("About us", "Về chúng tôi"),
    },
    testimonial: {
      title: twoTone(lt("What ", ""), lt("Clients Say", "Khách Hàng Nói")),
      body: lta(["Quote 1"], ["Trích dẫn 1"]),
    },
    approach: [{ title: lt("Approach 1", "Cách 1"), body: lta(["Step A"], ["Bước A"]) }],
    intro: {
      title: twoTone(lt("Our ", ""), lt("Story", "Câu Chuyện")),
    },
    capability: {
      title: twoTone(lt("Our ", ""), lt("Capabilities", "Năng Lực")),
      groups: [{ title: lt("Group 1", "Nhóm 1"), items: lta(["cap1"], ["năng lực 1"]) }],
      closing: lta(["Closing line"], ["Dòng kết"]),
    },
    process: {
      title: twoTone(lt("Our ", ""), lt("Process", "Quy Trình")),
      steps: [step],
    },
    timeline: {
      title: twoTone(lt("Our ", ""), lt("Journey", "Hành Trình")),
      intro: lta(["Intro line"], ["Dòng intro"]),
      milestones: [milestone],
    },
  };

  it("parses a valid aboutPage block", () => {
    expect(aboutPageBlock.safeParse(valid).success).toBe(true);
  });

  it("parses aboutPage without hero.video / testimonial.image (both optional → v1 stays valid)", () => {
    expect("video" in valid.hero).toBe(false);
    expect("image" in valid.testimonial).toBe(false);
    expect(aboutPageBlock.safeParse(valid).success).toBe(true);
  });

  it("parses aboutPage with hero.video (VideoRef) + testimonial.image (AssetRef) present", () => {
    const d = {
      ...valid,
      hero: { ...valid.hero, video: { posterAssetId: cuid(), mp4AssetId: cuid() } },
      testimonial: { ...valid.testimonial, image: { assetId: cuid(), alt: lt("Client", "Khách") } },
    };
    expect(aboutPageBlock.safeParse(d).success).toBe(true);
  });

  it("rejects aboutPage with non-cuid testimonial.image.assetId", () => {
    const d = { ...valid, testimonial: { ...valid.testimonial, image: { assetId: "bad" } } };
    expect(aboutPageBlock.safeParse(d).success).toBe(false);
  });

  it("rejects aboutPage with hero.video missing mp4AssetId (VideoRef requires it)", () => {
    const d = { ...valid, hero: { ...valid.hero, video: { posterAssetId: cuid() } } };
    expect(aboutPageBlock.safeParse(d).success).toBe(false);
  });

  it("parses milestone with optional items and note", () => {
    const d = {
      ...valid,
      timeline: {
        ...valid.timeline,
        milestones: [
          {
            ...milestone,
            items: lta(["item a"], ["mục a"]),
            note: lt("See more", "Xem thêm"),
          },
        ],
      },
    };
    expect(aboutPageBlock.safeParse(d).success).toBe(true);
  });

  it("rejects empty approach array", () => {
    expect(aboutPageBlock.safeParse({ ...valid, approach: [] }).success).toBe(false);
  });

  it("rejects empty process steps", () => {
    const d = { ...valid, process: { ...valid.process, steps: [] } };
    expect(aboutPageBlock.safeParse(d).success).toBe(false);
  });

  it("rejects testimonial missing title (TwoToneTitle missing accent)", () => {
    const d = {
      ...valid,
      testimonial: {
        title: { lead: lt("What", "Gì") }, // missing accent
        body: lta(["Quote"], ["Trích dẫn"]),
      },
    };
    expect(aboutPageBlock.safeParse(d).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. contactPageBlock
// ---------------------------------------------------------------------------
describe("contactPageBlock", () => {
  const valid = {
    hero: {
      title: twoTone(lt("Contact ", "Liên hệ "), lt("Us", "chúng tôi")),
      subtitle: lt("Get in touch", "Liên hệ với chúng tôi"),
    },
    map: {
      eyebrow: lt("Find us", "Tìm chúng tôi"),
      title: twoTone(lt("Our ", ""), lt("Location", "Địa Điểm")),
    },
  };

  it("parses a valid contactPage block", () => {
    expect(contactPageBlock.safeParse(valid).success).toBe(true);
  });

  it("rejects missing map", () => {
    const { map: _, ...d } = valid;
    expect(contactPageBlock.safeParse(d).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 12. notFoundBlock
// ---------------------------------------------------------------------------
describe("notFoundBlock", () => {
  const valid = {
    eyebrow: lt("404", "404"),
    title: twoTone(lt("Page not ", "Trang "), lt("found", "không tìm thấy")),
    body: lt("The page you requested...", "Trang bạn yêu cầu..."),
    cta: { label: lt("Go home", "Về trang chủ"), href: "/" },
    image: { assetId: cuid(), alt: lt("404 image", "Ảnh 404") },
  };

  it("parses a valid notFound block", () => {
    expect(notFoundBlock.safeParse(valid).success).toBe(true);
  });

  it("rejects missing cta", () => {
    const { cta: _, ...d } = valid;
    expect(notFoundBlock.safeParse(d).success).toBe(false);
  });

  it("rejects title missing accent", () => {
    const d = { ...valid, title: { lead: lt("Page not", "Trang") } };
    expect(notFoundBlock.safeParse(d).success).toBe(false);
  });

  it("rejects invalid image assetId", () => {
    const d = { ...valid, image: { assetId: "not-cuid" } };
    expect(notFoundBlock.safeParse(d).success).toBe(false);
  });
});
