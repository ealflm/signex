import type { Dictionary } from "@/app/[lang]/dictionaries";
import { SITE_URL } from "@/app/lib/seo";

// Site-wide schema.org structured data: an Organization + WebSite @graph, rendered as a
// <script type="application/ld+json"> (Next's Metadata API has no JSON-LD field). All values are
// pulled from the dictionary footer NAP so they stay single-sourced + bilingual.
//
// Organization (NOT LocalBusiness): SIGNEX is a B2B OEM manufacturer selling to brands, not a
// walk-in storefront — no opening hours / local-pack signals apply. The Office + Factory are ONE
// legal entity at two sites, so `address` is an array (avoids splitting the brand into two nodes).
export function OrgJsonLd({ dict }: { dict: Dictionary }) {
  const f = dict.footer;
  // "(+84) 979 700 072" → E.164 "+84979700072"
  const telephone = "+" + f.tel.replace(/\D/g, "");
  const address = [f.office, f.factory].map((line) => ({
    "@type": "PostalAddress",
    streetAddress: line.replace(/,?\s*Viet\s?Nam\.?\s*$/i, "").trim(),
    addressLocality: "Ho Chi Minh City",
    addressCountry: "VN",
  }));

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "SIGNEX",
        legalName: f.company,
        url: SITE_URL,
        logo: `${SITE_URL}/assets/images/signex-logo.svg`,
        image: `${SITE_URL}/assets/images/signex-og.png`,
        email: f.email,
        telephone,
        taxID: f.tax,
        address,
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "sales",
          telephone,
          email: f.email,
          areaServed: "VN",
          availableLanguage: ["vi", "en"],
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "SIGNEX",
        inLanguage: ["vi", "en"],
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }} />
  );
}
