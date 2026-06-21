// app/lib/nap.ts
// Single render-helper projection over the unified businessContact block (spec §5.2/§10.5).
// Footer, home contact card, contactPage cards, and org-json-ld all read NAP through here so
// there is ONE source of company/email/phone/address/tax (resolves the old duplicated dict copy).
import type { SiteContent } from "@/app/lib/content";

type BC = SiteContent["businessContact"];

export function napView(bc: BC) {
  const phone = (k: "tel" | "zalo") => bc.phones.find((p) => p.kind === k)?.value;
  const site = (k: "office" | "factory") => bc.sites.find((s) => s.kind === k)?.address ?? "";
  return {
    company: bc.legalName,
    email: bc.emails[0] ?? "",
    emails: bc.emails,
    tel: phone("tel") ?? "",
    zalo: phone("zalo"),
    office: site("office"),
    factory: site("factory"),
    tax: bc.taxId,
    social: bc.social,
  };
}
