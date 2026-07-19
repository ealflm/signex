// app/lib/seo-icons.ts
// Favicon resolution for <head> — a PURE module (no app imports) so it stays trivially testable.
// The bundled static set is the fallback; when the snapshot carries configured favicons
// (meta.favicons — resolved to CDN URLs in content.ts), they win.
// Favicons (favicon.io set: SIGNEX lotus mark). The .ico is auto-served from app/favicon.ico;
// these PNGs add the type/size hints modern browsers + Apple devices prefer.
export const ICONS = {
  icon: [
    { url: "/assets/images/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    { url: "/assets/images/favicon-16x16.png", type: "image/png", sizes: "16x16" },
  ],
  apple: "/assets/images/apple-touch-icon.png",
};

/** Build the Metadata.icons value from the snapshot's resolved favicons; fall back to the
 *  bundled static set when none are configured. rel "apple-touch-icon" → icons.apple. */
export function iconsFrom(
  favicons: Array<{ rel: string; url: string }> | undefined,
): typeof ICONS | { icon: Array<{ url: string }>; apple?: string } {
  const list = favicons ?? [];
  if (list.length === 0) return ICONS;
  const icon = list.filter((f) => f.rel !== "apple-touch-icon").map((f) => ({ url: f.url }));
  const apple = list.find((f) => f.rel === "apple-touch-icon")?.url;
  return { icon: icon.length ? icon : ICONS.icon, ...(apple ? { apple } : {}) };
}
