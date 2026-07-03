// app/(dash)/visual/aspect-presets.ts
// Crop aspect-ratio presets for the image cropper + a per-zone default. react-easy-crop always crops
// to a FIXED aspect (no free-draw), so "Original" means the image's natural ratio (resolved at load
// time); the rest are common fixed ratios. The default preset is keyed by the edit field so a hero
// crop starts wide and a portrait testimonial starts tall; unlisted fields default to "Original".
// Users can switch to any preset, and "Use full image" always uploads the original un-cropped.

export interface AspectPreset {
  id: string;
  label: string;
  /** null = use the image's natural ratio (resolved when the image loads). */
  ratio: number | null;
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { id: "original", label: "Original", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
];

// Default preset per edit field (block.path). Wide heroes → 16:9; portrait testimonial → 4:5;
// logos/watermark have no meaningful crop ratio → Original (the user usually just "Use full image").
const DEFAULT_PRESET_BY_FIELD: Record<string, string> = {
  "hero.image": "16:9",
  "contactPage.hero.image": "16:9",
  "aboutPage.testimonial.image": "4:5",
  "features.featured.image": "original",
  "nav.logo": "original",
  "footer.logo": "original",
  "footer.watermark": "original",
};

export function defaultPresetId(field: string | undefined): string {
  const id = field ? DEFAULT_PRESET_BY_FIELD[field] : undefined;
  return id && ASPECT_PRESETS.some((p) => p.id === id) ? id : "original";
}

// Human-friendly caption for an edit field (block.path), so editors see "Home hero image" instead
// of the raw `hero.image` dot-path. Returns null for unmapped fields (caller falls back to the code).
const FIELD_LABEL: Record<string, string> = {
  "catalog.category.image": "Category image",
  "catalog.product.image": "Product image",
  "hero.image": "Home hero image",
  "contactPage.hero.image": "Contact hero image",
  "aboutPage.testimonial.image": "Testimonial photo",
  "aboutPage.hero.video": "About hero video",
  "features.featured.image": "Feature image",
  "features.video.media": "Workshop video",
  "nav.logo": "Header logo",
  "footer.logo": "Footer logo",
  "footer.watermark": "Footer watermark",
};

export function fieldLabel(field: string | undefined): string | null {
  return (field && FIELD_LABEL[field]) || null;
}
