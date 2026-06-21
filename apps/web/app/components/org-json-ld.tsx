import type { Dictionary } from "@/app/[lang]/dictionaries";
import { SITE_URL } from "@/app/lib/seo";
import { napView } from "@/app/lib/nap";

// Site-wide schema.org Organization + WebSite @graph from the UNIFIED businessContact NAP
// (single source — footer/home/contactPage read the same projection). social[].href feeds sameAs.
export function OrgJsonLd({ dict }: { dict: Dictionary }) {
  const nap = napView(dict.businessContact);
  const telephone = "+" + nap.tel.replace(/\D/g, ""); // "(+84) 979 700 072" -> "+84979700072"
  const address = [nap.office, nap.factory].filter(Boolean).map((line) => ({
    "@type": "PostalAddress",
    streetAddress: line.replace(/,?\s*Viet\s?Nam\.?\s*$/i, "").trim(),
    addressLocality: "Ho Chi Minh City",
    addressCountry: "VN",
  }));
  const sameAs = nap.social.map((s) => s.href).filter((h) => h && h !== "#");

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "SIGNEX",
        legalName: nap.company,
        url: SITE_URL,
        logo: `${SITE_URL}/assets/images/signex-logo.svg`,
        image: `${SITE_URL}/assets/images/signex-og.png`,
        email: nap.email,
        telephone,
        taxID: nap.tax,
        address,
        ...(sameAs.length ? { sameAs } : {}),
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "sales",
          telephone,
          email: nap.email,
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
