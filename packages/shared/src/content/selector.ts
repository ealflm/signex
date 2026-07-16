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
 *   <tag>                          type selector — see below
 *   .<class>                       Webflow classes; [A-Za-z0-9_-] covers every class in the template
 *   :nth-of-type(<1-99>)           tie-break among SAME-TAG siblings — the NAME is part of the
 *                                  grammar, not decoration: :nth-child counts all siblings rather
 *                                  than per-tag, which is a different selector entirely
 *   " " / " > "                    descendant / child, single spaces only. NOTE the generator emits
 *                                  ONLY " " today — color-engine.ts's buildSelector joins with
 *                                  `.join(" ")` and never produces " > ". The child combinator is
 *                                  accepted because hand-stamped and previously-stored selectors use
 *                                  it, and because the cost of admitting it is one space and one `>`
 *                                  in the alphabet. Read this list as what is ACCEPTED; the emitted
 *                                  subset is narrower, and buildSelector's own comment measures what
 *                                  that costs.
 *
 * THE TYPE SELECTOR, and why it is worth widening an injection surface for. Without it a segment
 * could only be `.class`, so an element carrying no class and no `data-sx-c` was not expressible AT
 * ALL — the generator returned null and the panel told the user "không xác định được vị trí riêng
 * của phần tử". Measured on the live home page: 107 elements that are visible, clickable and paint
 * text or a background could not be anchored, among them the nav links, several headings and the
 * form labels — 90 `<span>`, 10 `<div>`, 6 `<sup>`. The spec's first decision is "mọi element × mọi
 * thuộc tính"; a grammar with no type production cannot honour it.
 *
 * It also makes `:nth-of-type` mean what it says. CSS evaluates nth-of-type per element TYPE, so
 * `.card:nth-of-type(1)` matches every element that is BOTH first of its own tag and carries
 * `.card` — a `<span class="card">` and a `<div class="card">` sibling pair matched both (the bug
 * fixed in 2878c40, which could only defend by refusing to anchor). Qualified by its tag,
 * `div.card:nth-of-type(1)` names one element by construction, so the tie-break stopped needing a
 * collision check to be safe: see selector-path.ts.
 *
 * CHARSET. `[A-Za-z][A-Za-z0-9]*` is every tag name in this template and in HTML/SVG generally
 * (`h1`, `sup`, `linearGradient`). It deliberately excludes `-` (custom elements — the template is
 * Webflow output and has none; the generator refuses a tag outside this charset rather than emit
 * one), and every character that could begin to matter in a `<style>`: no `:`, `\`, whitespace,
 * `{`, `}`, `<`, `>`, `/`, `[`, `(`, `*`, quote. `span{}</style><script>…`, `span[onload=x]` and
 * `*` are all outside it, and selector.test.ts pins that.
 *
 * A BARE TAG IS NOT A SEGMENT: a type selector must be qualified by a class or an index, because
 * that is all the generator emits (it never has a reason to say "the only div here" when
 * "div:nth-of-type(1)" is strictly narrower and equally available). So no stored selector can be
 * `body` or `html` or `div` alone. This bounds the blast radius rather than closing it — a hostile
 * `body:nth-of-type(1)` IS expressible and would repaint the page — and that is accepted, not
 * overlooked: writing a palette is an authenticated admin action, and an admin can already repaint
 * every page by moving a seed. The property that matters is that nothing here can escape the
 * `<style>` or reach a script, and the charset is what holds it.
 *
 * `.class:nth-of-type(n)` (no tag) is still ACCEPTED though the generator no longer emits it —
 * selectors stored by the previous grammar must keep rendering, and re-admitting it widens the
 * alphabet by nothing.
 */
const TYPE = "[A-Za-z][A-Za-z0-9]*";
const CLASS = "\\.[A-Za-z0-9_-]+";
const NTH = "(?::nth-of-type\\([1-9][0-9]?\\))";
const SEG = [
  '\\[data-sx-block="[A-Za-z0-9_-]+"\\]',
  '\\[data-sx-c="[A-Za-z0-9._:-]+"\\]',
  `(?:${TYPE})?${CLASS}${NTH}?`,
  `${TYPE}${NTH}`,
].join("|");

export const SELECTOR_RE = new RegExp(`^(?:${SEG})(?:(?: > | )(?:${SEG}))*$`);

/**
 * Bounds the `<style>` a hostile/looping client can produce.
 *
 * IT BITES REAL CONTENT, and that is a deliberate trade rather than a theoretical cap. Measured on
 * the live home page (27bcb03's sweep): of 250 visible, painting elements, **26 generate a selector
 * of 306–354 chars and are therefore unanchorable** — every one of them a `gsap_split_letter` div,
 * an individual letter of a split heading nested ~18 levels deep. They are *expressible* (the
 * grammar accepts their shape); they are just too long to store. Before the type production they
 * failed earlier, at pickSegment, so this cap is where they surface now — the count moved between
 * causes, it did not appear.
 *
 * Raising it is not free: this number is the bound on how much CSS one authenticated admin action
 * can push into every visitor's page, so it is a security parameter first and an ergonomics one
 * second. Shortening the PATH (a child-combinator join, an anchor stamped nearer the letters) is the
 * cheaper fix and does not touch this bound. Left at 300 on purpose.
 */
export const SELECTOR_MAX_LEN = 300;

export function isSafeSelector(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= SELECTOR_MAX_LEN && SELECTOR_RE.test(v);
}

export type CssSelector = string;

export const CssSelectorSchema = z
  .string()
  .max(SELECTOR_MAX_LEN)
  .refine((v) => SELECTOR_RE.test(v), "unsupported selector");
