// app/components/home/features-compact.tsx
// Homepage "Vì Sao Các Thương Hiệu Chọn Chúng Tôi" — the COMPACT rendering: eyebrow + title
// centred, then the shared 4-criteria icon grid. No images, no workshop video, no CTA (the full
// block with the featured video lives on the About page — features-full.tsx). Same features
// block data on both pages; the section keeps data-sx-block="features" for the editor.
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";
import { FeaturesCriteria } from "@/app/components/home/features-criteria";

export function FeaturesCompact({
  dict,
  editable = false,
}: {
  dict: Dictionary["features"];
  editable?: boolean;
}) {
  const t = dict;
  return (
    <section className="section_features" data-sx-block="features">
      <div className="padding-global">
        <div className="w-layout-blockcontainer container-large w-container">
          <div className="sx-features-head" data-w-id="0f29df12-8c38-da6f-794d-3989ac10d663" style={{ opacity: 0, filter: "blur(5px)" }}>
            <div className="master_label" data-wf--tag--variant="base">
              <div className="label-small">
                <span {...editableAttrs(editable, "features.eyebrow", { text: { maxLength: 80 } })}>{t.eyebrow}</span>
              </div>
            </div>
            <h2 className="margin-0">
              <span {...editableAttrs(editable, "features.title.lead", { text: { maxLength: 80 } })}>{t.titleTop}</span>
              <br />
              <span className="tone-medium" {...editableAttrs(editable, "features.title.accent", { text: { maxLength: 80 } })}>
                {t.titleBottom}
              </span>
            </h2>
          </div>
          <FeaturesCriteria dict={dict} editable={editable} />
        </div>
      </div>
    </section>
  );
}
