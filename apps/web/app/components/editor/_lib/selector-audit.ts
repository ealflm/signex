// Page-aware audit of stored per-element colour-override selectors (the "Màu không còn áp dụng"
// panel section). The OLD rule — broken ⟺ querySelectorAll(sel).length !== 1 on the CURRENT
// page — false-positived every override scoped to a DIFFERENT page (about-page selectors audited
// while previewing home match 0 there by definition) and every override under a multi-root block
// (aboutPage stamps six section roots, so a legitimate selector can match >1).
//
// New rule, per selector:
//   • its first segment ([data-sx-block="…"] or [data-sx-c="…"] — buildSelector always anchors on
//     one) matches 0 elements here  → "off-page": its whole scope isn't on this page; unauditable,
//     and NOT reported.
//   • full selector matches ≥ 1     → "ok": it still paints (≥2 = multi-root, still painting).
//   • scope present, full match 0   → "broken": reported (the user decides; never auto-removed).
//   • unparseable                   → "broken" (dead everywhere).
export type AuditStatus = "ok" | "broken" | "off-page";

const FIRST_SEGMENT_RE = /^\[data-sx-(?:block|c)="[^"]*"\]/;

export function auditSelector(sel: string, count: (selector: string) => number): AuditStatus {
  let full: number;
  try {
    full = count(sel);
  } catch {
    return "broken";
  }
  if (full >= 1) return "ok";
  const first = FIRST_SEGMENT_RE.exec(sel)?.[0];
  if (first) {
    try {
      if (count(first) === 0) return "off-page";
    } catch {
      return "broken";
    }
  }
  // No data-sx anchor to scope by (defensive — minted selectors always have one): keep the old
  // strictness for a zero-match selector.
  return "broken";
}

export function brokenSelectors(selectors: string[], count: (selector: string) => number): string[] {
  return selectors.filter((s) => auditSelector(s, count) === "broken");
}
