import type { Palette } from "@signex/shared";
import { paletteStyle } from "@signex/shared";

/**
 * Emits the site palette override AFTER the template CSS so its :root declarations win by source
 * order. Renders nothing when there is no palette (public byte-identical to pre-feature). Safe:
 * paletteStyle() re-validates every value to a hex and allow-lists variable names, so the string
 * carries no untrusted content.
 */
export function PaletteStyle({ palette }: { palette: Palette | undefined | null }) {
  const css = paletteStyle(palette);
  if (!css) return null;
  return <style id="signex-palette" dangerouslySetInnerHTML={{ __html: css }} />;
}
