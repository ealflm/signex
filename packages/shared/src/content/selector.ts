import { z } from "zod";

/**
 * Grammar for a per-element colour override's target selector.
 *
 * A stored selector travels DB → ReleaseSnapshot → `<style>` via dangerouslySetInnerHTML, which is
 * exactly the stored-XSS class fixed in 7061210: `<style>` is an HTML raw-text element, so the HTML
 * parser does NOT honour CSS escapes — a selector containing `</style><script>…` would break out
 * and execute for every visitor no matter how it were escaped. Escaping is therefore not a defence.
 * The rule is REJECT, and it is enforced at two layers (schema on save, emitter on render) because
 * an already-persisted hostile value must not be trusted either.
 *
 * The grammar is deliberately the smallest thing the generator (edit-overlay's color-engine) can
 * emit — nothing more:
 *   [data-sx-block="<blockKey>"]   block root scope
 *   [data-sx-c="<anchorId>"]       stable hand-stamped anchor
 *   .<class>                       Webflow classes; [A-Za-z0-9_-] covers every class in the template
 *   :nth-of-type(<1-99>)           tie-break when a class isn't unique among siblings
 *   " " / " > "                    descendant / child, single spaces only
 */
const SEG = [
  '\\[data-sx-block="[A-Za-z0-9_-]+"\\]',
  '\\[data-sx-c="[A-Za-z0-9._:-]+"\\]',
  "\\.[A-Za-z0-9_-]+(?::nth-of-type\\([1-9][0-9]?\\))?",
].join("|");

export const SELECTOR_RE = new RegExp(`^(?:${SEG})(?:(?: > | )(?:${SEG}))*$`);

/** Bounds the `<style>` a hostile/looping client can produce. */
export const SELECTOR_MAX_LEN = 300;

export function isSafeSelector(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= SELECTOR_MAX_LEN && SELECTOR_RE.test(v);
}

export type CssSelector = string;

export const CssSelectorSchema = z
  .string()
  .max(SELECTOR_MAX_LEN)
  .refine((v) => SELECTOR_RE.test(v), "unsupported selector");
