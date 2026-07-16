import test from "node:test";
import assert from "node:assert/strict";
import { pickSegment } from "./selector-path.ts";
import { isSafeSelector } from "@signex/shared";

const el = (tag, ...classes) => ({ tag, classes });

// ── The invariant, stated independently of the code under test ──────────────────────────────────
//
// pickSegment's whole contract is "this segment selects `target` and no other sibling". Asserting
// literal strings only checks that it emits what its author expected; it cannot catch a segment that
// is wrong about CSS. So state CSS's rules once, in the smallest form that is obviously right, and
// hold every emitted segment to them:
//
//   • a type selector matches on the element's tag;
//   • a class selector matches when the element carries the class;
//   • :nth-of-type(n) matches when the element is the nth of ITS OWN TAG among its siblings —
//     per TAG, not per class, which is the entire subject of 2878c40 and of this file's rung 2/3.
//
// `.card:nth-of-type(1)` matching both a first-span and a first-div falls straight out of the third
// rule, which is why matchesSegment below is written from the rule and not from an intuition.
function parseSegment(seg) {
  const m = /^([A-Za-z][A-Za-z0-9]*)?(?:\.([A-Za-z0-9_-]+))?(?::nth-of-type\((\d+)\))?$/.exec(seg);
  assert.ok(m, `segment outside the grammar shape: ${seg}`);
  return { tag: m[1], cls: m[2], nth: m[3] ? Number(m[3]) : undefined };
}

function matchesSegment(seg, candidate, siblings) {
  const { tag, cls, nth } = parseSegment(seg);
  if (tag !== undefined && candidate.tag !== tag) return false;
  if (cls !== undefined && !candidate.classes.includes(cls)) return false;
  if (nth !== undefined) {
    const sameTag = siblings.filter((s) => s.tag === candidate.tag);
    if (sameTag.indexOf(candidate) + 1 !== nth) return false;
  }
  return true;
}

/** Assert `seg` is a real, grammar-legal segment that selects exactly `target` among `siblings`. */
function assertSelectsOnly(seg, target, siblings) {
  assert.ok(seg, "expected a segment");
  // Every rung must also be something the shared grammar accepts; a segment the emitter would drop
  // is not an anchor, it is a silent no-op on the public site.
  assert.equal(isSafeSelector(`[data-sx-block="b"] ${seg}`), true, `not in the grammar: ${seg}`);
  const hit = siblings.filter((s) => matchesSegment(seg, s, siblings));
  assert.deepEqual(hit, [target], `${seg} selected ${hit.length} siblings, wanted exactly target`);
}

// ── Rung 1: a class no sibling carries ──────────────────────────────────────────────────────────

test("prefers a class that is unique among siblings", () => {
  const target = el("div", "btn-bg");
  const siblings = [el("div", "button_text-mask"), target];
  assert.equal(pickSegment(target, siblings), ".btn-bg");
  assertSelectsOnly(pickSegment(target, siblings), target, siblings);
});

test("a unique class beats the tag — durability is not traded for precision", () => {
  const target = el("span", "tone-medium");
  // The tag alone would disambiguate here too (target is the only span), and an index would as
  // well. Neither may displace the class: authored intent outlives DOM order.
  const siblings = [el("div"), target, el("div")];
  assert.equal(pickSegment(target, siblings), ".tone-medium");
});

test("ignores classes outside the grammar charset", () => {
  const target = el("div", "w-变体", "btn-bg");
  assert.equal(pickSegment(target, [el("div", "other"), target]), ".btn-bg");
});

// ── Rung 2: a class no SAME-TAG sibling carries ─────────────────────────────────────────────────
//
// This is the case 2878c40 had to refuse. `.card` is shared, so rung 1 is out; naming the tag
// separates the div from the span WITHOUT an index, so it is both anchorable and order-free.

test("qualifies a shared class with the tag when no same-tag sibling carries it", () => {
  const target = el("div", "card");
  const siblings = [el("span", "card"), target];
  const seg = pickSegment(target, siblings);
  assert.equal(seg, "div.card");
  assertSelectsOnly(seg, target, siblings);
});

// The exact shape of the old bug, kept as a regression test in the form that matters: whatever
// pickSegment emits here, it must NOT also select the span. It used to emit `.card:nth-of-type(1)`,
// which does (both are index 1 of their own tag) — assertSelectsOnly fails on that string.
test("never emits a segment that also matches a differently-tagged sibling sharing the class", () => {
  const target = el("div", "card");
  const siblings = [el("span", "card"), target];
  assertSelectsOnly(pickSegment(target, siblings), target, siblings);
  // And specifically: the tagless form the old grammar was limited to is not what comes back.
  assert.notEqual(pickSegment(target, siblings), ".card:nth-of-type(1)");
});

test("picks a same-tag-unique class over one shared with a same-tag sibling", () => {
  const target = el("div", "card", "frame");
  const siblings = [el("span", "frame"), el("div", "card"), target];
  // "card" is carried by another DIV, so it cannot be the rung-2 class; "frame" is carried only by
  // a span, so `div.frame` names target alone.
  const seg = pickSegment(target, siblings);
  assert.equal(seg, "div.frame");
  assertSelectsOnly(seg, target, siblings);
});

// ── Rung 3: a same-tag sibling carries every class target has ───────────────────────────────────

test("adds tag + nth-of-type when a same-tag sibling shares every class", () => {
  const target = el("div", "card");
  const siblings = [el("div", "card"), target, el("div", "card")];
  const seg = pickSegment(target, siblings);
  assert.equal(seg, "div.card:nth-of-type(2)");
  assertSelectsOnly(seg, target, siblings);
});

test("nth-of-type counts only same-tag siblings", () => {
  const target = el("div", "card");
  const siblings = [el("span", "card"), el("div", "card"), target];
  // Two divs precede-or-are target among divs: divs are [el("div","card"), target] -> idx 2.
  const seg = pickSegment(target, siblings);
  assert.equal(seg, "div.card:nth-of-type(2)");
  assertSelectsOnly(seg, target, siblings);
});

test("returns null when the same-tag index exceeds the grammar's cap of 99", () => {
  const target = el("div", "card");
  const siblings = [...Array.from({ length: 99 }, () => el("div", "card")), target];
  assert.equal(pickSegment(target, siblings), null);
});

// ── Rung 4: no usable class at all — the case this whole change exists for ──────────────────────

test("falls back to the tag when the element has no class (features.title.lead)", () => {
  // The user's element, verbatim: <h2 class="margin-0"><span>Vì Sao…</span><span class="tone-medium">
  // …</span></h2>. The lead span carries nothing, and before the type production the grammar could
  // not express it at all — the panel said "không xác định được vị trí riêng của phần tử".
  const target = el("span");
  const siblings = [target, el("span", "tone-medium")];
  const seg = pickSegment(target, siblings);
  assert.equal(seg, "span:nth-of-type(1)");
  assertSelectsOnly(seg, target, siblings);
});

test("the unclassed sibling of an unclassed element gets its own index", () => {
  const a = el("span");
  const b = el("span");
  const siblings = [a, b];
  assert.equal(pickSegment(b, siblings), "span:nth-of-type(2)");
  assertSelectsOnly(pickSegment(b, siblings), b, siblings);
});

test("an unclassed element with no same-tag sibling still anchors", () => {
  const target = el("sup");
  const siblings = [el("div", "x"), target];
  const seg = pickSegment(target, siblings);
  assert.equal(seg, "sup:nth-of-type(1)");
  assertSelectsOnly(seg, target, siblings);
});

test("returns null when the tag is outside the grammar charset and no class survives", () => {
  // A custom element has a hyphen, which the type charset excludes on purpose. The template has
  // none; this is the guard, and it must refuse rather than emit `my-widget:nth-of-type(1)`.
  assert.equal(pickSegment(el("my-widget"), [el("my-widget")]), null);
  // …but a unique class does not need the tag, so it still anchors.
  const target = el("my-widget", "hero");
  assert.equal(pickSegment(target, [el("my-widget"), target]), ".hero");
});

// ── The contract, over a lot of shapes ──────────────────────────────────────────────────────────
//
// The rungs are only worth anything if the invariant holds for sibling lists nobody thought to
// enumerate — the collision that shipped was in exactly such a list. Enumerate them instead:
// every combination of tags and class sets, for every target, at three sibling counts.

test("every segment it emits selects exactly the target, over an exhaustive sibling space", () => {
  const TAGS = ["div", "span", "sup"];
  const CLASSES = [[], ["card"], ["frame"], ["card", "frame"]];
  const shapes = [];
  for (const t of TAGS) for (const c of CLASSES) shapes.push({ tag: t, classes: c });

  let emitted = 0;
  let refused = 0;
  const walk = (n, acc) => {
    if (acc.length === n) {
      const siblings = acc.map((s) => ({ tag: s.tag, classes: s.classes }));
      for (const target of siblings) {
        const seg = pickSegment(target, siblings);
        if (seg === null) {
          refused++;
          // A refusal is only legitimate when nothing in the grammar could have worked. Every shape
          // here has a usable tag and ≤3 same-tag siblings, so there is always a rung — a null is a
          // lost anchor, which is the defect this change exists to remove.
          assert.fail(`refused to anchor ${JSON.stringify(target)} among ${JSON.stringify(siblings)}`);
        }
        emitted++;
        assertSelectsOnly(seg, target, siblings);
      }
      return;
    }
    for (const s of shapes) walk(n, [...acc, s]);
  };
  for (const n of [1, 2, 3]) walk(n, []);
  assert.equal(refused, 0);
  // Guard the guard: a walk that silently enumerated nothing would pass every assertion above.
  // 12 + 12²·2 + 12³·3 = 12 + 288 + 5184 = 5484.
  assert.equal(emitted, 5484);
});
