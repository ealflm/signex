import test from "node:test";
import assert from "node:assert/strict";
import { EDIT_MODES, MODE_AFFORDANCE_CSS, isEditMode, modeScope } from "./edit-mode.ts";
import { capSel } from "./edit-caps.ts";

// ---------------------------------------------------------------------------------------------
//  A parser for the narrow CSS grammar edit-mode.ts emits. Rules are checked as PARSED SELECTORS,
//  not as substrings of the source, so these tests describe the cascade the browser will actually
//  run rather than the text someone happened to write.
// ---------------------------------------------------------------------------------------------

/** Split a selector LIST on top-level commas. Cannot be a plain `.split(",")`: capSel's matcher
 *  values contain commas (`[data-edit-caps^="text,"]`). */
const splitList = (sel) => {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of sel) {
    if (ch === '"') quoted = !quoted;
    if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
};

const RULES = MODE_AFFORDANCE_CSS.replace(/\/\*[\s\S]*?\*\//g, "") // comments carry commas/braces
  .split("}")
  .map((chunk) => chunk.split("{"))
  .filter((parts) => parts.length === 2)
  .map(([sel, decls], index) => ({
    index,
    selectors: splitList(sel),
    decls: decls.trim(),
  }));

/** The `body[data-sx-mode="x"]` / `body:not([data-sx-mode="x"])` gate a selector opens with. */
const gateOf = (sel) => {
  const m = sel.match(/^body(:not\()?\[data-sx-mode="([a-z]+)"\](\))?\s/);
  return m ? { negated: !!m[1], mode: m[2] } : null;
};

/** The modes in which a rule is live. */
const liveModes = (rule) =>
  EDIT_MODES.filter((mode) =>
    rule.selectors.some((sel) => {
      const g = gateOf(sel);
      return g && (g.negated ? g.mode !== mode : g.mode === mode);
    }),
  );

/**
 * Specificity (b, c, d) for the narrow grammar here: type selectors, attribute selectors, classes,
 * pseudo-classes, descendant combinators, and `:not(<simple>)` — which per spec contributes its
 * argument's specificity, so unwrapping and counting the inside is equivalent. Anything outside
 * this grammar is a shape these tests were never checked against; the parser is deliberately narrow
 * so that adding one fails loudly here rather than silently mis-ranking a rule.
 */
const specificity = (sel) => {
  const flat = sel.replace(/:not\(([^)]*)\)/g, " $1 ");
  const tokens = flat.match(/\[[^\]]*\]|\.[-\w]+|#[-\w]+|::?[-\w]+|[-\w]+/g) ?? [];
  let b = 0;
  let c = 0;
  let d = 0;
  for (const t of tokens) {
    if (t.startsWith("#")) b += 1;
    else if (t.startsWith("[") || t.startsWith(".")) c += 1;
    else if (t.startsWith("::")) d += 1;
    else if (t.startsWith(":")) c += 1;
    else d += 1;
  }
  return [b, c, d];
};

const ruleDeclaring = (prop, value) =>
  RULES.find((r) => new RegExp(`(^|;)\\s*${prop}\\s*:[^;]*${value}`).test(r.decls));

// ---------------------------------------------------------------------------------------------
//  The mode value itself
// ---------------------------------------------------------------------------------------------

test("isEditMode accepts exactly the four modes", () => {
  for (const mode of ["media", "text", "color", "content"]) {
    assert.equal(isEditMode(mode), true, mode);
  }
  assert.deepEqual([...EDIT_MODES].sort(), ["color", "content", "media", "text"]);
});

// setMode arrives over postMessage from another window: `typeof data.mode === "string"` is NOT a
// validation of it. An unrecognised string would be written to body.dataset.sxMode, where it
// matches no gate below — every affordance silently off, with dispatch in a state no branch owns.
test("isEditMode rejects anything that is not one of the four", () => {
  for (const junk of [
    "",
    "banana",
    "Text",
    "TEXT",
    " text",
    "text ",
    "text,color",
    "colour",
    null,
    undefined,
    0,
    1,
    true,
    {},
    [],
    ["text"],
    { mode: "text" },
  ]) {
    assert.equal(isEditMode(junk), false, JSON.stringify(junk) ?? String(junk));
  }
});

test("modeScope builds a gate that carries its own descendant combinator", () => {
  // capSel pastes the prefix on verbatim, so a missing combinator would silently produce a
  // COMPOUND selector (body[…][data-edit-caps=…]) that matches only a <body> — i.e. nothing.
  assert.equal(modeScope("text"), 'body[data-sx-mode="text"] ');
  assert.ok(modeScope("color").endsWith(" "));
});

// ---------------------------------------------------------------------------------------------
//  The affordance rules
// ---------------------------------------------------------------------------------------------

test("every affordance rule is gated on a mode", () => {
  assert.ok(RULES.length > 0, "no rules parsed out of MODE_AFFORDANCE_CSS");
  for (const rule of RULES) {
    for (const sel of rule.selectors) {
      assert.ok(gateOf(sel), `ungated selector (live in EVERY mode): ${sel}`);
    }
    // A rule whose selectors disagree about the gate would be live in a union of modes — every
    // rule here is meant to have one gate.
    const gates = new Set(rule.selectors.map((s) => JSON.stringify(gateOf(s))));
    assert.equal(gates.size, 1, `rule ${rule.index} mixes gates: ${rule.selectors.join(" , ")}`);
  }
});

test("the capability matchers are capSel's — boundary-pinned, not hand-rolled", () => {
  for (const rule of RULES) {
    for (const sel of rule.selectors) {
      if (!sel.includes("data-edit-caps")) continue;
      // `~=` (space-separated word) never matches a comma-joined value; `*="text"` (bare substring)
      // matches "textarea". Both are wrong in ways nothing downstream can detect.
      assert.doesNotMatch(sel, /\[data-edit-caps~=/, sel);
      assert.match(sel, /\[data-edit-caps(=|\^=|\$=|\*=)"[^"]*"\]/, sel);
    }
  }
  // The text rules must be exactly the four matchers capSel emits, gated.
  assert.ok(
    MODE_AFFORDANCE_CSS.includes(capSel("text", "", modeScope("text"))),
    "text affordance is not built from capSel(…, modeScope('text'))",
  );
});

// THE property this whole task turns on. Before mode existed, the text and colour affordance rules
// had identical specificity and disagreed on the same element (hero.titleBottom declares both caps),
// so SOURCE ORDER decided which outline painted, and it had to be hand-kept in step with the click
// dispatch. Gating them on mutually exclusive modes is what retires that: two rules that are never
// live at the same time cannot contend, whatever order they are written in.
test("text and colour outlines are never live in the same mode", () => {
  const textOutline = ruleDeclaring("outline", "solid");
  const colorOutline = ruleDeclaring("outline", "dashed");
  assert.ok(textOutline, "no text outline rule");
  assert.ok(colorOutline, "no colour outline rule");
  const both = liveModes(textOutline).filter((m) => liveModes(colorOutline).includes(m));
  assert.deepEqual(both, [], `text and colour outlines contend in: ${both.join(", ")}`);
});

test("each affordance is live only in the mode that dispatches it", () => {
  assert.deepEqual(liveModes(ruleDeclaring("outline", "solid")), ["text"]);
  assert.deepEqual(liveModes(ruleDeclaring("outline", "dashed")), ["color"]);
  assert.deepEqual(liveModes(ruleDeclaring("cursor", "text")), ["text"]);
});

// Where two rules DO overlap, order is still load-bearing — so it gets a test rather than a comment.
// In colour mode the resolved block is marked .sx-color-hover and must read as clickable; but if it
// also declares the text cap, the non-text `cursor: default` rule matches it too, at the SAME
// specificity. Equal specificity ⇒ the later rule wins, so the colour rule must be written after.
test("in colour mode the colour cursor beats the non-text default cursor", () => {
  const dflt = ruleDeclaring("cursor", "default");
  const pointer = ruleDeclaring("cursor", "pointer");
  assert.ok(dflt && pointer, "missing a cursor rule");
  assert.ok(liveModes(dflt).includes("color"), "the default-cursor rule is not live in colour mode");
  assert.deepEqual(liveModes(pointer), ["color"]);

  const worst = (rule) =>
    rule.selectors.map(specificity).sort((x, y) => y[1] - x[1] || y[2] - x[2])[0];
  assert.deepEqual(
    worst(pointer),
    worst(dflt),
    "specificity changed — if the colour rule now outranks (or is outranked), re-derive this test",
  );
  assert.ok(pointer.index > dflt.index, "the colour cursor rule must be written LAST to win");
});

// sync() positions a visible hotspot by writing `style.display = "block"` inline. Only an
// !important declaration in a stylesheet outranks an inline one, so without it the hotspots stay
// clickable in every mode — the exact ambiguity mode exists to remove.
test("hotspots are hidden outside media mode, beating sync()'s inline display", () => {
  const hidden = ruleDeclaring("display", "none");
  assert.ok(hidden, "no hotspot-hiding rule");
  assert.match(hidden.decls, /display\s*:\s*none\s*!important/);
  assert.ok(hidden.selectors.every((s) => s.includes(".sx-edit-hotspot")), "wrong target");
  assert.deepEqual(liveModes(hidden).sort(), ["color", "content", "text"]);
});
