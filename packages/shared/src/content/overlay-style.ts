import type { Overlay } from "./primitives";
export type OverlayStyle = { backgroundColor?: string; backgroundImage?: string };
function rgba(color: string, opacity: number): string {
  const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}
export function overlayCss(o: Overlay | undefined | null): OverlayStyle {
  if (!o) return {};
  if (o.kind === "solid") return { backgroundColor: rgba(o.fill.color, o.fill.opacity) };
  const stops = o.stops.map((s) => `${rgba(s.color, s.opacity)} ${s.pos}%`).join(", ");
  return { backgroundImage: `linear-gradient(${o.angle}deg, ${stops})` };
}
