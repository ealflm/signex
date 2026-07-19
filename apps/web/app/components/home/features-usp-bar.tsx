// app/components/home/features-usp-bar.tsx
// Homepage "Vì Sao Các Thương Hiệu Chọn Chúng Tôi" — the coloured USP-bar rendering: 4 items, each a
// coloured icon (left) + coloured uppercase title (right), no description, no card box (client ref
// image #23). Keeps data-sx-block="features" for the editor; the section eyebrow/title are dropped.
// Per-item colours are hardcoded like the footer brand badges (NOT palette tokens) — the four are
// sampled (dominant pixel colour, ImageMagick histogram) from ref image #23, index-aligned to
// criteria 1→4: green (TOP 3 uy tín), orange-red (bảo mật), blue (tư vấn), orange (giao hàng).
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";
import { buildCriteria } from "@/app/components/home/features-criteria-data";

// green · orange-red · blue · orange (sampled from ref image #23).
const USP_COLORS = ["#008344", "#e15617", "#267293", "#ff9100"];

export function FeaturesUspBar({
  dict,
  editable = false,
}: {
  dict: Dictionary["features"];
  editable?: boolean;
}) {
  const criteria = buildCriteria(dict);
  return (
    <div className="sx-usp-bar">
      {criteria.map((c, i) => (
        <div className="sx-usp-item" key={i} style={{ color: USP_COLORS[i] }}>
          <span className="sx-usp-icon">{c.icon}</span>
          <span className="sx-usp-title">
            <span {...editableAttrs(editable, c.titleField, { text: { maxLength: 80 } })}>{c.title}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
