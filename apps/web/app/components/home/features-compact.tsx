// app/components/home/features-compact.tsx
// Homepage "Vì Sao Các Thương Hiệu Chọn Chúng Tôi" — the coloured USP-bar rendering (features-usp-bar).
// The section eyebrow + title were removed on request; the same fields still edit via the About header.
// Keeps data-sx-block="features" for the editor.
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { FeaturesUspBar } from "@/app/components/home/features-usp-bar";

export function FeaturesCompact({
  dict,
  editable = false,
}: {
  dict: Dictionary["features"];
  editable?: boolean;
}) {
  return (
    <section className="section_features sx-features-compact" data-sx-block="features">
      <div className="padding-global">
        <div className="w-layout-blockcontainer container-large w-container">
          <FeaturesUspBar dict={dict} editable={editable} />
        </div>
      </div>
    </section>
  );
}
