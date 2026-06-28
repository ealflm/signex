// app/preview/[lang]/contact/page.tsx — EDITOR PREVIEW of the /contact page (live working snapshot).
// Mirrors the public /contact body (app/[lang]/contact/page.tsx) — same contact-c hero + info cards +
// parallax image, the shared <Contact> section, and the FAQ/map block — but reads the WORKING
// snapshot (getPreviewSnapshot) and wraps the body in the preview shell (Navbar/Footer editable +
// <EditOverlay/>). Token-gated + force-dynamic identically to the home preview (see its header for
// the cacheComponents rationale): the page renders ONLY the <Suspense> boundary; ALL request-time
// work (connection(), searchParams, the uncached snapshot read) happens in the child.
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { hasLocale, DEFAULT_LOCALE } from "@/app/lib/i18n-config";
import { getPreviewSnapshot } from "@/app/lib/content";
import { Navbar } from "@/app/components/navbar";
import { Footer } from "@/app/components/footer";
import { Contact } from "@/app/components/home/contact";
import { EditOverlay } from "@/app/components/editor/edit-overlay";
import { PreviewRuntime } from "@/app/preview/preview-runtime";
import { editAttrs, editText } from "@/app/lib/edit-attrs";

// Contact info-card icons (lucide), index-aligned with contactPage.cards: mail / phone / map-pin —
// kept identical to the public page (icons aren't translated / editable).
const ICON_SVG = {
  fill: "none",
  height: "100%",
  width: "100%",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.5,
  viewBox: "0 0 24 24",
  xmlns: "http://www.w3.org/2000/svg",
} as const;
const CONTACT_ICONS = [
  <svg key="mail" className="lucide lucide-mail-icon lucide-mail" {...ICON_SVG}>
    <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
    <rect height="16" rx="2" width="20" x="2" y="4" />
  </svg>,
  <svg key="phone" className="lucide lucide-phone-icon lucide-phone" {...ICON_SVG}>
    <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
  </svg>,
  <svg key="map-pin" className="lucide lucide-map-pin-icon lucide-map-pin" {...ICON_SVG}>
    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
    <circle cx="12" cy="10" r="3" />
  </svg>,
];

// Card title leaf keys, index-aligned with contactPage.cards (Email / Phone / Address).
const CARD_KEYS = ["email", "phone", "address"] as const;

async function PreviewContact({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ secret?: string; theme?: string }>;
}) {
  await connection(); // request-time only — never prerender this subtree
  const { secret, theme } = await searchParams;
  if (!process.env.PREVIEW_SECRET || secret !== process.env.PREVIEW_SECRET) notFound();

  const { lang } = await params;
  const locale = hasLocale(lang) ? lang : DEFAULT_LOCALE;
  const dict = await getPreviewSnapshot(locale, theme);

  return (
    <div className="page-wrapper">
      <Navbar dict={dict.nav} editable />
      <main id="main" className="main-wrapper">
        <section className="section_hero-contact-c" data-w-id="ad1a3029-1630-4dbd-9a8f-fd5ea3c4eb18">
          <div className="padding-global">
            <div className="w-layout-blockcontainer container-large w-container">
              <div className="headline_contact-c" data-w-id="ad1a3029-1630-4dbd-9a8f-fd5ea3c4eb1b" style={{ opacity: 0, filter: 'blur(5px)' }}>
                <div className="heading_contact-c">
                  <div className="master_label" data-wf--tag--variant="base">
                    <div className="label-small">
                      <span {...editText(true, "contactPage.hero.eyebrow", { maxLength: 40 })}>{dict.contactPage.hero.eyebrow}</span>
                    </div>
                  </div>
                  <h1>
                    <span {...editText(true, "contactPage.hero.title.lead", { maxLength: 80 })}>{dict.contactPage.hero.title}</span>
                    <span className="tone-medium" {...editText(true, "contactPage.hero.title.accent", { maxLength: 80 })}>
                      {dict.contactPage.hero.titleAccent}
                    </span>
                  </h1>
                </div>
                <div className="contact-c_hero-p">
                  <p className="tone-medium margin-0">
                    <span {...editText(true, "contactPage.hero.subtitle", { maxLength: 200 })}>{dict.contactPage.hero.subtitle}</span>
                  </p>
                </div>
              </div>
              <div className="w-layout-grid grid_contact-c" data-w-id="9ee4e313-28b4-9f47-35ac-12e943420a2d" style={{ opacity: 0, filter: 'blur(5px)' }}>
                {dict.contactPage.cards.map((c, i) => (
                  <div className="card_contact-c" key={c.title}>
                    <div className="wrap_icon-contact">
                      <div className="icon_contact-c w-embed">
                        {CONTACT_ICONS[i]}
                      </div>
                    </div>
                    <div className="text_contact-c-card">
                      <div className="text-size-large text_body-bold">
                        <span {...editText(true, `contactPage.cardLabels.${CARD_KEYS[i]}`, { maxLength: 40 })}>{c.title}</span>
                      </div>
                      <div className="tone-medium contact-card_lines">
                        {c.company && (
                          <div>
                            <span {...editText(true, c.company.field, { maxLength: 80 })}>{c.company.text}</span>
                          </div>
                        )}
                        {c.rows.map((row, j) => (
                          <div key={j}>
                            {row.label &&
                              (c.strongLabel ? (
                                <strong {...editText(true, row.label.field, { maxLength: 80 })}>{row.label.text}</strong>
                              ) : (
                                <span {...editText(true, row.label.field, { maxLength: 80 })}>{row.label.text}</span>
                              ))}
                            {row.label ? ": " : ""}
                            <span {...editText(true, row.value.field, { maxLength: 160 })}>{row.value.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="image_contact-c" data-w-id="a7c263a0-bae9-4cd0-4784-0bc0e59ff63b" style={{ opacity: 0, filter: 'blur(5px)' }}>
                <img alt={dict.contactPage.hero.imageAlt || "Sara dubler koei 7y yt io unsplash"} className="image_cover is-parallax" loading="lazy" src={dict.contactPage.hero.imageUrl || "/assets/images/69aeefb3f6044f0563d94f4b_sara-dubler-Koei_7yYtIo-unsplash.avif"} {...editAttrs(true, "contactPage.hero.image", "image")} />
              </div>
            </div>
          </div>
        </section>
        <Contact
          dict={dict}
          headlineWid="ad1a3029-1630-4dbd-9a8f-fd5ea3c4eb1b"
          gridWid="9ee4e313-28b4-9f47-35ac-12e943420a2d"
          formWid="a7c263a0-bae9-4cd0-4784-0bc0e59ff63b"
          showCards={false}
          editable
        />
        <section className="section_faq">
          <div className="padding-global">
            <div className="w-layout-blockcontainer container-large w-container">
              <div className="headline_faq-v1" data-w-id="9dfc7646-5801-a3d5-162a-aebf30a19078">
                <div className="master_label" data-wf--tag--variant="base">
                  <div className="label-small">
                    <span {...editText(true, "contactPage.map.eyebrow", { maxLength: 80 })}>{dict.contactPage.map.eyebrow}</span>
                  </div>
                </div>
                <h2 className="margin-0">
                  <span {...editText(true, "contactPage.map.title.lead", { maxLength: 80 })}>{dict.contactPage.map.title}</span>
                  <span className="tone-medium" {...editText(true, "contactPage.map.title.accent", { maxLength: 80 })}>
                    {dict.contactPage.map.titleAccent}
                  </span>
                </h2>
              </div>
              <div className="contact-map">
                <iframe
                  title="Signex — 85/45 Dương Thị Mười, Phường Trung Mỹ Tây, TP.HCM"
                  className="contact-map_frame"
                  src="https://www.google.com/maps?q=85%2F45%20D%C6%B0%C6%A1ng%20Th%E1%BB%8B%20M%C6%B0%E1%BB%9Di%2C%20Ph%C6%B0%E1%BB%9Dng%20Trung%20M%E1%BB%B9%20T%C3%A2y%2C%20Tp.HCM&output=embed&z=16"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        </section>
        <Footer dict={dict.footer} editable />
      </main>
      <EditOverlay />
      {/* Webflow boot in this dynamic subtree (not the layout) — see preview-runtime.tsx (#418 fix). */}
      <PreviewRuntime />
    </div>
  );
}

export default function PreviewContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ secret?: string; theme?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <PreviewContact params={params} searchParams={searchParams} />
    </Suspense>
  );
}
