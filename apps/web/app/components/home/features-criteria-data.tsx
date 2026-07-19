// app/components/home/features-criteria-data.tsx
// The four "Vì Sao Các Thương Hiệu Chọn Chúng Tôi" criteria as shared data (icons + snapshot field
// paths + resolved text) — the ONE source consumed by BOTH the homepage USP bar and the About page's
// 5-cell row, so the two cannot drift. Criterion 1 is the featured tile's text (features.featured.*,
// image dropped in round 2); 2–4 are features.cards[0..2]. Icons: gauge · eye · handshake · shield-check.
import type { ReactNode } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";

export const ICON_PROPS = {
  fill: "none",
  height: "100%",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: "var(--_❇️-icon---icon-stroke)",
  viewBox: "0 0 24 24",
  width: "100%",
  xmlns: "http://www.w3.org/2000/svg",
} as const;

export const CRITERIA_ICONS: ReactNode[] = [
  <svg key="gauge" className="lucide lucide-gauge-icon lucide-gauge" {...ICON_PROPS}>
    <path d="m12 14 4-4" />
    <path d="M3.34 19a10 10 0 1 1 17.32 0" />
  </svg>,
  <svg key="eye" className="lucide lucide-eye-icon lucide-eye" {...ICON_PROPS}>
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>,
  <svg key="handshake" className="lucide lucide-handshake-icon lucide-handshake" {...ICON_PROPS}>
    <path d="m11 17 2 2a1 1 0 1 0 3-3" />
    <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
    <path d="m21 3 1 11h-2" />
    <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
    <path d="M3 4h8" />
  </svg>,
  <svg key="shield-check" className="lucide lucide-shield-check-icon lucide-shield-check" {...ICON_PROPS}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </svg>,
];

export function buildCriteria(dict: Dictionary["features"]) {
  const t = dict;
  return [
    { icon: CRITERIA_ICONS[0], titleField: "features.featured.title", descField: "features.featured.desc", title: t.featured.title, desc: t.featured.desc },
    { icon: CRITERIA_ICONS[1], titleField: "features.cards.0.title", descField: "features.cards.0.desc", title: t.cards[0].title, desc: t.cards[0].desc },
    { icon: CRITERIA_ICONS[2], titleField: "features.cards.1.title", descField: "features.cards.1.desc", title: t.cards[1].title, desc: t.cards[1].desc },
    { icon: CRITERIA_ICONS[3], titleField: "features.cards.2.title", descField: "features.cards.2.desc", title: t.cards[2].title, desc: t.cards[2].desc },
  ];
}
