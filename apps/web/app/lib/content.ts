// apps/web/app/lib/content.ts
// PUBLIC read-path. The published snapshot is read straight from Postgres via @signex/db
// (one indexed row, no api at request time), validated by the SAME zod schema the api used to
// write it, and resolved to a per-locale view. The published loader is `'use cache'` +
// cacheTag('release') so Publish (api -> /api/revalidate) can mark the whole site stale with
// one tag. It reads NO draft-mode() — doing so at the caller would force the shell dynamic under
// cacheComponents and forfeit SSG (spec §10.1). Any Prisma/parse error -> INITIAL_SNAPSHOT,
// so the site never 500s on data (spec §13).
import "server-only";
import { cacheTag } from "next/cache";
import { prisma } from "@signex/db";
import { ReleaseSnapshotSchema, type ReleaseSnapshot } from "@signex/shared";
import type { Locale } from "@/app/lib/i18n-config";
import { INITIAL_SNAPSHOT } from "@/app/lib/initial-snapshot";

// SiteContent is declared AFTER resolveForLang (below) via ReturnType<typeof resolveForLang>.
// This decouples the web type from en.json — the transform's output IS the type.

// Asset URLs are NEVER frozen into the snapshot — only the r2Key is. Resolve at read time so the
// site survives a CDN/domain migration (spec §3.1.3). Empty base = relative key (dev only).
export function resolveAssetUrl(r2Key: string): string {
  const base = (process.env.MEDIA_PUBLIC_BASE ?? "").replace(/\/+$/, "");
  return base ? `${base}/${r2Key}` : `/${r2Key}`;
}

// Bilingual leaf helpers
function t(node: { en: string; vi: string } | undefined, lang: Locale, fallback = ""): string {
  return node?.[lang] ?? fallback;
}
function ta(node: { en: string[]; vi: string[] } | undefined, lang: Locale): string[] {
  return node?.[lang] ?? [];
}

// Full structural transform: snapshot (ReleaseSnapshot) → SiteContent (Dictionary shape).
// This is the inverse of the importer's buildBlocks. Every field is explicitly mapped.
function resolveForLang(snap: ReleaseSnapshot, lang: Locale) {
  const b = snap.blocks;
  const bc = b.businessContact;

  // Resolve an assetId (from AssetRef or VideoRef) to a public URL via the snapshot's
  // flat asset map. Returns "" when the assetId is absent from the map (INITIAL_SNAPSHOT
  // path with no DB record — callers should || fallback to the en.json URL literal).
  function assetUrl(assetId: string): string {
    const asset = snap.assets[assetId];
    return asset ? resolveAssetUrl(asset.r2Key) : "";
  }

  // businessContact helpers — phones and sites may be in any order
  const tel = bc.phones.find((p) => p.kind === "tel");
  const zalo = bc.phones.find((p) => p.kind === "zalo");
  const office = bc.sites.find((s) => s.kind === "office");
  const factory = bc.sites.find((s) => s.kind === "factory");

  // ── NAP with inline-edit field paths ──────────────────────────────────────────
  // The footer + contact cards render the unified businessContact (NAP). To make every value
  // click-to-edit, each leaf carries its snapshot path; the canvas edit routes to the Business
  // contact block. Indices are the LIVE array positions so the path stays correct after reorders.
  const BC = "businessContact";
  const telIdx = bc.phones.findIndex((p) => p.kind === "tel");
  const zaloIdx = bc.phones.findIndex((p) => p.kind === "zalo");
  const officeIdx = bc.sites.findIndex((s) => s.kind === "office");
  const factoryIdx = bc.sites.findIndex((s) => s.kind === "factory");
  type NapLeaf = { text: string; field: string };
  type NapRow = { label: NapLeaf | null; value: NapLeaf };
  const leaf = (text: string, field: string): NapLeaf => ({ text, field });
  const compact = <T,>(arr: (T | null | undefined)[]): T[] => arr.filter((x): x is T => x != null);
  const phoneRow = (i: number): NapRow | null =>
    i < 0
      ? null
      : { label: leaf(t(bc.phones[i].label, lang), `${BC}.phones.${i}.label`), value: leaf(bc.phones[i].value, `${BC}.phones.${i}.value`) };
  const addrRow = (i: number): NapRow | null =>
    i < 0
      ? null
      : { label: leaf(t(bc.sites[i].label, lang), `${BC}.sites.${i}.label`), value: leaf(t(bc.sites[i].address, lang), `${BC}.sites.${i}.address`) };
  const emailRows: NapRow[] = bc.emails.map((v, i) => ({ label: null, value: leaf(v, `${BC}.emails.${i}`) }));
  const taxRow: NapRow = { label: leaf(t(bc.taxLabel, lang), `${BC}.taxLabel`), value: leaf(bc.taxId, `${BC}.taxId`) };
  const legalNameLeaf = leaf(t(bc.legalName, lang), `${BC}.legalName`);

  // formConfig block
  const fc = b.formConfig;
  const fFields = fc.fields;

  return {
    businessContact: {
      legalName: t(bc.legalName, lang),
      brand: t(bc.brand, lang),
      emails: bc.emails,
      phones: bc.phones.map((p) => ({ kind: p.kind, label: t(p.label, lang), value: p.value })),
      taxId: bc.taxId,
      taxLabel: t(bc.taxLabel, lang),
      sites: bc.sites.map((s) => ({ kind: s.kind, label: t(s.label, lang), address: t(s.address, lang) })),
      social: bc.social.map((s) => ({ kind: s.kind, href: s.href })),
    },
    hero: {
      titleTop: t(b.hero.titleTop, lang),
      titleBottom: t(b.hero.titleBottom, lang),
      subtitle: t(b.hero.subtitle, lang),
      // hero.image is AssetRef { assetId, alt? }; resolve alt and URL from the assets map
      imageAlt: t(b.hero.image.alt, lang),
      imageUrl: assetUrl(b.hero.image.assetId),
    },
    form: {
      name: t(fFields.name.label, lang),
      namePlaceholder: t(fFields.name.placeholder, lang),
      email: t(fFields.email.label, lang),
      emailPlaceholder: t(fFields.email.placeholder, lang),
      phone: t(fFields.phone.label, lang),
      phonePlaceholder: t(fFields.phone.placeholder, lang),
      quantity: t(fFields.quantity.label, lang),
      quantityPlaceholder: t(fFields.quantity.placeholder, lang),
      standard: t(fFields.standard.label, lang),
      standardPlaceholder: t(fFields.standard.placeholder, lang),
      standardOptions: fc.standardOptions.map((o) => t(o.label, lang)),
      height: t(fFields.height.label, lang),
      heightPlaceholder: t(fFields.height.placeholder, lang),
      width: t(fFields.width.label, lang),
      widthPlaceholder: t(fFields.width.placeholder, lang),
      thickness: t(fFields.thickness.label, lang),
      thicknessPlaceholder: t(fFields.thickness.placeholder, lang),
      upload: t(fFields.upload.label, lang),
      uploadHelp: t(fc.uploadHelp, lang),
      message: t(fFields.message.label, lang),
      messagePlaceholder: t(fFields.message.placeholder, lang),
      submit: t(fc.submit, lang),
      // formConfig.submitting OPTIONAL → fall back to the literal Webflow wait-label per locale.
      submitting: t(fc.submitting, lang, lang === "vi" ? "Vui lòng đợi..." : "Please wait..."),
      success: t(fc.success, lang),
      fail: t(fc.fail, lang),
    },
    features: {
      eyebrow: t(b.features.eyebrow, lang),
      titleTop: t(b.features.title.lead, lang),
      titleBottom: t(b.features.title.accent, lang),
      cta: t(b.features.cta.label, lang),
      // video.media is VideoRef? — resolve asset refs to URLs; falls back to "" when absent
      videoTitle: t(b.features.video.title, lang),
      videoText: t(b.features.video.text, lang),
      videoMedia: b.features.video.media
        ? {
            posterUrl: assetUrl(b.features.video.media.posterAssetId),
            mp4Url: assetUrl(b.features.video.media.mp4AssetId),
            webmUrl: b.features.video.media.webmAssetId
              ? assetUrl(b.features.video.media.webmAssetId)
              : "",
          }
        : { posterUrl: "", mp4Url: "", webmUrl: "" },
      featured: {
        title: t(b.features.featured.title, lang),
        desc: t(b.features.featured.desc, lang),
        // featured.image is AssetRef? — resolve URL/alt; "" when absent so the
        // component falls back to the literal still (published v1 snapshot stays valid).
        imageUrl: assetUrl(b.features.featured.image?.assetId ?? ""),
        imageAlt: t(b.features.featured.image?.alt, lang),
      },
      cards: b.features.cards.map((card) => ({
        title: t(card.title, lang),
        desc: t(card.desc, lang),
      })),
    },
    about: {
      eyebrow: t(b.about.eyebrow, lang),
      title: t(b.about.title.lead, lang),
      titleAccent: t(b.about.title.accent, lang),
      body: t(b.about.body, lang),
      mission: {
        title: t(b.about.mission.title, lang),
        body: t(b.about.mission.body, lang),
        items: ta(b.about.mission.items, lang),
      },
      vision: {
        title: t(b.about.vision.title, lang),
        body: t(b.about.vision.body, lang),
      },
      values: {
        title: t(b.about.values.title, lang),
        body: t(b.about.values.body, lang),
      },
    },
    products: {
      eyebrow: t(b.productsHeader.eyebrow, lang),
      title: t(b.productsHeader.title.lead, lang),
      titleAccent: t(b.productsHeader.title.accent, lang),
      body: t(b.productsHeader.body, lang),
      statLabels: {
        products: t(b.productsHeader.statLabels.products, lang),
        materials: t(b.productsHeader.statLabels.materials, lang),
      },
      detail: {
        listTitle: t(b.productsHeader.detail.listTitle.lead, lang),
        listTitleAccent: t(b.productsHeader.detail.listTitle.accent, lang),
      },
      product: {
        categoryLabel: t(b.productsHeader.product.categoryLabel, lang),
        materialLabel: t(b.productsHeader.product.materialLabel, lang),
        cta: t(b.productsHeader.product.cta, lang),
        back: t(b.productsHeader.product.back, lang),
        zoomHint: t(b.productsHeader.product.zoomHint, lang),
      },
      // Catalog categories: images are FrozenAsset inline (r2Key present).
      // Resolve r2Key → URL at read time so a CDN/domain migration never requires a
      // snapshot re-publish (spec §3.1.3). Falls back to empty string when no image
      // is attached yet (caller should guard or use a placeholder).
      categories: (snap.catalog?.categories ?? []).map((cat) => ({
        tag: t(cat.tag, lang),
        title: t(cat.title, lang),
        slug: cat.slug,
        products: cat.productCount,
        materials: cat.materialCount,
        intro: t(cat.intro, lang),
        image: { url: cat.image ? resolveAssetUrl(cat.image.r2Key) : "" },
        items: cat.items.map((item) => ({
          slug: item.slug,
          title: t(item.title, lang),
          tag: t(item.tag, lang),
          desc: t(item.desc, lang),
          image: { url: item.image ? resolveAssetUrl(item.image.r2Key) : "" },
        })),
      })),
    },
    contact: {
      // contactPage.eyebrow is OPTIONAL in the snapshot → fall back to the original literal so the
      // live site is byte-identical until someone edits it.
      eyebrow: t(b.contactPage.eyebrow, lang) || (lang === "vi" ? "Liên Hệ" : "Reach Out"),
      title: t(b.contactPage.hero.title.lead, lang),
      titleAccent: t(b.contactPage.hero.title.accent, lang),
      subtitle: t(b.contactPage.hero.subtitle, lang),
      cards: [
        {
          // contactPage.cardLabels.* are OPTIONAL → fall back to the original literal titles.
          title: t(b.contactPage.cardLabels?.email, lang) || "Email",
          rows: emailRows,
        },
        {
          title: t(b.contactPage.cardLabels?.phone, lang) || "Phone",
          rows: compact([phoneRow(telIdx), phoneRow(zaloIdx)]),
        },
        {
          // Home address card shows the address only (no "Office:" label), like the original.
          title: t(b.contactPage.cardLabels?.address, lang) || "Address",
          rows: compact([addrRow(officeIdx), addrRow(factoryIdx)]).map(
            (r): NapRow => ({ label: null, value: r.value }),
          ),
        },
      ],
    },
    footer: {
      // The brand line is "<brand> – <suffix>". footer.brandSuffix is OPTIONAL → fall back to the
      // original literal so the live site is byte-identical until edited. Split into prefix + suffix
      // so the component can stamp ONLY the editable suffix span (the "<brand> – " prefix is derived).
      brandPrefix: `${t(bc.brand, lang)} – `,
      brandSuffix: t(b.footer.brandSuffix, lang) || "Manufacturing Brand Identity",
      tagline: ta(b.footer.tagline, lang),
      contactHeading: t(b.footer.contactHeading, lang),
      company: t(bc.legalName, lang),
      email: bc.emails[0] ?? "",
      tel: tel?.value ?? "",
      zalo: zalo?.value ?? "",
      tax: bc.taxId,
      office: office ? t(office.address, lang) : "",
      factory: factory ? t(factory.address, lang) : "",
      // Structured NAP with inline-edit field paths (footer renders these so each value is editable).
      nap: {
        legalName: legalNameLeaf,
        email: emailRows[0]?.value ?? leaf("", `${BC}.emails.0`),
        tel: phoneRow(telIdx),
        zalo: phoneRow(zaloIdx),
        tax: taxRow,
        office: addrRow(officeIdx),
        factory: addrRow(factoryIdx),
      },
      quickHeading: t(b.footer.quickHeading, lang),
      // footer.logo is AssetRef? — resolve URL; "" when absent so the component falls
      // back to the literal signex-logo.svg (published v1 snapshot stays valid).
      logoUrl: assetUrl(b.footer.logo?.assetId ?? ""),
      // footer.watermark is AssetRef? — decorative lotus; "" when absent so the component falls
      // back to the literal /assets/images/lotus.svg. Editable as footer.watermark.
      watermarkUrl: assetUrl(b.footer.watermark?.assetId ?? ""),
      watermarkAlt: t(b.footer.watermark?.alt, lang),
      links: b.footer.links.map((l) => ({
        label: t(l.label, lang),
        href: l.href,
      })),
      shipLabel: t(b.footer.shipLabel, lang),
      // footer.shipping is OPTIONAL → fall back to the original literal badges so the live site
      // is byte-identical until edited. Locale-invariant brand names, like payments.
      shipping: b.footer.shipping ?? ["Lalamove", "Grab"],
      payLabel: t(b.footer.payLabel, lang),
      payments: b.footer.payments,
      // Social hrefs come from the unified businessContact.social (edited under "Business contact").
      // The footer renders Facebook/YouTube; fall back to "#" when a network has no URL yet.
      social: {
        facebook: bc.social.find((s) => s.kind === "facebook")?.href ?? "#",
        youtube: bc.social.find((s) => s.kind === "youtube")?.href ?? "#",
      },
    },
    nav: {
      skip: t(b.nav.skip, lang),
      cta: t(b.nav.cta.label, lang),
      // nav.logo is AssetRef — resolve to a URL so Navbar can override the CSS mask at runtime
      logoUrl: assetUrl(b.nav.logo.assetId),
      links: b.nav.links.map((l) => ({
        label: t(l.label, lang),
        href: l.href,
      })),
    },
    aboutPage: {
      hero: {
        title: t(b.aboutPage.hero.title.lead, lang),
        titleAccent: t(b.aboutPage.hero.title.accent, lang),
        subtitle: t(b.aboutPage.hero.subtitle, lang),
        // hero.video is VideoRef? — resolve asset refs to URLs (mirrors features.video.media);
        // all "" when absent so the component falls back to the literal 8440992-uhd poster+mp4+webm.
        videoMedia: b.aboutPage.hero.video
          ? {
              posterUrl: assetUrl(b.aboutPage.hero.video.posterAssetId),
              mp4Url: assetUrl(b.aboutPage.hero.video.mp4AssetId),
              webmUrl: b.aboutPage.hero.video.webmAssetId
                ? assetUrl(b.aboutPage.hero.video.webmAssetId)
                : "",
            }
          : { posterUrl: "", mp4Url: "", webmUrl: "" },
      },
      testimonial: {
        eyebrow: t(b.aboutPage.testimonial.eyebrow, lang),
        title: t(b.aboutPage.testimonial.title.lead, lang),
        titleAccent: t(b.aboutPage.testimonial.title.accent, lang),
        body: ta(b.aboutPage.testimonial.body, lang),
        // testimonial.image is AssetRef? — "" when absent so the component falls back to the literal.
        imageUrl: assetUrl(b.aboutPage.testimonial.image?.assetId ?? ""),
        imageAlt: t(b.aboutPage.testimonial.image?.alt, lang),
      },
      approach: b.aboutPage.approach.map((a) => ({
        title: t(a.title, lang),
        body: ta(a.body, lang),
      })),
      intro: {
        eyebrow: t(b.aboutPage.intro.eyebrow, lang),
        title: t(b.aboutPage.intro.title.lead, lang),
        titleAccent: t(b.aboutPage.intro.title.accent, lang),
        body: t(b.aboutPage.intro.body, lang),
      },
      capability: {
        eyebrow: t(b.aboutPage.capability.eyebrow, lang),
        title: t(b.aboutPage.capability.title.lead, lang),
        titleAccent: t(b.aboutPage.capability.title.accent, lang),
        body: t(b.aboutPage.capability.body, lang),
        groups: b.aboutPage.capability.groups.map((g) => ({
          title: t(g.title, lang),
          items: ta(g.items, lang),
        })),
        closing: ta(b.aboutPage.capability.closing, lang),
      },
      process: {
        eyebrow: t(b.aboutPage.process.eyebrow, lang),
        title: t(b.aboutPage.process.title.lead, lang),
        titleAccent: t(b.aboutPage.process.title.accent, lang),
        body: t(b.aboutPage.process.body, lang),
        steps: b.aboutPage.process.steps.map((s) => ({
          title: t(s.title, lang),
          body: t(s.body, lang),
        })),
      },
      timeline: {
        eyebrow: t(b.aboutPage.timeline.eyebrow, lang),
        title: t(b.aboutPage.timeline.title.lead, lang),
        titleAccent: t(b.aboutPage.timeline.title.accent, lang),
        body: t(b.aboutPage.timeline.body, lang),
        intro: ta(b.aboutPage.timeline.intro, lang),
        milestones: b.aboutPage.timeline.milestones.map((m) => ({
          num: m.num,
          title: t(m.title, lang),
          body: t(m.body, lang),
          ...(m.items !== undefined ? { items: ta(m.items, lang) } : {}),
          ...(m.note !== undefined ? { note: t(m.note, lang) } : {}),
        })),
      },
    },
    contactPage: {
      hero: {
        // hero.eyebrow OPTIONAL → fall back to the original literal "Contact" so the live site is
        // byte-identical until edited. Same label in both locales' mockups (locale-invariant default).
        eyebrow: t(b.contactPage.hero.eyebrow, lang) || "Contact",
        title: t(b.contactPage.hero.title.lead, lang),
        titleAccent: t(b.contactPage.hero.title.accent, lang),
        subtitle: t(b.contactPage.hero.subtitle, lang),
        // hero.image is AssetRef? — "" when absent so the contact page falls back to the literal
        // sara-dubler still (published v1 snapshot stays valid). Editable as contactPage.hero.image.
        imageUrl: assetUrl(b.contactPage.hero.image?.assetId ?? ""),
        imageAlt: t(b.contactPage.hero.image?.alt, lang),
      },
      cards: [
        {
          // Shared with the home contact cards: contactPage.cardLabels.* OPTIONAL → literal fallback.
          title: t(b.contactPage.cardLabels?.email, lang) || "Email",
          rows: emailRows,
        },
        {
          title: t(b.contactPage.cardLabels?.phone, lang) || "Phone",
          rows: compact([phoneRow(telIdx), phoneRow(zaloIdx)]),
        },
        {
          // Address card: company line (bold, no label) + Office/Factory/Tax rows with bold labels.
          title: t(b.contactPage.cardLabels?.address, lang) || "Address",
          company: legalNameLeaf,
          strongLabel: true,
          rows: compact([addrRow(officeIdx), addrRow(factoryIdx), taxRow]),
        },
      ],
      map: {
        eyebrow: t(b.contactPage.map.eyebrow, lang),
        title: t(b.contactPage.map.title.lead, lang),
        titleAccent: t(b.contactPage.map.title.accent, lang),
      },
    },
    notFound: {
      eyebrow: t(b.notFound.eyebrow, lang),
      title: t(b.notFound.title.lead, lang),
      titleAccent: t(b.notFound.title.accent, lang),
      body: t(b.notFound.body, lang),
      cta: t(b.notFound.cta.label, lang),
      imageAlt: t(b.notFound.image.alt, lang),
      // notFound.image is AssetRef — URL resolves from the assets map; falls back to "" for
      // INITIAL_SNAPSHOT (the not-found-view.tsx 'use client' component stays hardcoded; see Task 61b)
      imageUrl: assetUrl(b.notFound.image.assetId),
    },
    meta: {
      siteName: b.meta.siteName,
      title: t(b.meta.title, lang),
      description: t(b.meta.description, lang),
      ogImageAlt: t(b.meta.ogImage.alt, lang),
      // meta.ogImage is AssetRef — resolve URL so seo.ts can serve the CDN path in og:image
      ogImageUrl: assetUrl(b.meta.ogImage.assetId),
      // NOTE: GA4 no longer comes from the snapshot. It moved to the global SiteConfig singleton
      // (admin Settings) so analytics is independent of the published theme — see
      // app/lib/site-config.ts (getGa4Id) wired into app/[lang]/layout.tsx.
      about: {
        title: t(b.meta.about.title, lang),
        description: t(b.meta.about.description, lang),
      },
      contact: {
        title: t(b.meta.contact.title, lang),
        description: t(b.meta.contact.description, lang),
      },
    },
  };
}

// SiteContent is the resolved per-locale view — inferred from resolveForLang's return type.
// Components keep importing `Dictionary` (aliased to SiteContent in dictionaries.ts shim).
// Decoupled from en.json: no cast needed; the transform's output IS the type.
export type SiteContent = ReturnType<typeof resolveForLang>;

// PUBLISHED path — cached + tagged. Draft-mode-free.
export async function getPublishedSnapshot(lang: Locale): Promise<SiteContent> {
  "use cache";
  cacheTag("release"); // single site-wide invalidation handle (Publish -> revalidateTag('release'))
  try {
    const rel = await prisma.release.findFirst({
      where: { status: "PUBLISHED" },
      orderBy: { version: "desc" },
      select: { snapshot: true },
    });
    if (!rel) return resolveForLang(INITIAL_SNAPSHOT, lang);
    return resolveForLang(ReleaseSnapshotSchema.parse(rel.snapshot), lang);
  } catch {
    // ANY Prisma/parse error -> last-known-good build constant. Site never 500s on data.
    return resolveForLang(INITIAL_SNAPSHOT, lang);
  }
}

// The name pages call. Today it is purely the published path; the preview island is a separate
// non-cached island (see app/components/preview-bar.tsx) so the shell stays cached + SSG.
export async function getSiteContent(lang: Locale): Promise<SiteContent> {
  return getPublishedSnapshot(lang);
}

// PREVIEW path — live working state via the api. NEVER cached, NEVER on the published path.
// Called only from the <Suspense>-wrapped preview island (app/components/preview-bar.tsx) so the
// public shell stays static. Reads PREVIEW_SECRET server-side.
export async function getPreviewSnapshot(lang: Locale, themeId?: string): Promise<SiteContent> {
  try {
    const base = process.env.API_URL ?? "http://api:3060";
    // Thread the optional themeId through to the preview controller (Task 8): when present it
    // serves THAT theme's draftSnapshot; when omitted the controller defaults to the live theme.
    const url = new URL(`${base}/api/preview/snapshot`);
    if (themeId) url.searchParams.set("themeId", themeId);
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-preview-secret": process.env.PREVIEW_SECRET ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return getPublishedSnapshot(lang);
    const result = ReleaseSnapshotSchema.safeParse(await res.json());
    if (!result.success) return getPublishedSnapshot(lang);
    return resolveForLang(result.data, lang);
  } catch {
    // Network throw or any other error -> fall back to published snapshot.
    return getPublishedSnapshot(lang);
  }
}
