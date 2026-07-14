import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLASS_COLOR_HOVER,
  CLASS_FLASH,
  OVERLAY_CLASS_PREFIX,
  OVERLAY_PAGE_CLASSES,
  isOverlayClass,
} from "./overlay-classes.ts";
import { MODE_AFFORDANCE_CSS } from "./edit-mode.ts";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

// ---------------------------------------------------------------------------------------------
//  The prefix rule. asSegment filters by PREFIX, not by a list of names, so that a mark added later
//  is filtered the day it is declared. That only holds while every declared mark carries the prefix.
// ---------------------------------------------------------------------------------------------

test("every page-stamped overlay class carries the reserved prefix", () => {
  // Anchor the loop: every for..of assertion below passes vacuously over an empty list, which is
  // exactly the shape that let an earlier bug through here.
  assert.ok(OVERLAY_PAGE_CLASSES.length > 0, "no page-stamped classes declared — nothing asserted");
  for (const cls of OVERLAY_PAGE_CLASSES) {
    assert.ok(cls.startsWith(OVERLAY_CLASS_PREFIX), `${cls} escapes the reserved prefix`);
    assert.ok(isOverlayClass(cls), `${cls} is not recognised as an overlay class`);
  }
});

test("isOverlayClass does not over-reach into the page's own sx- namespace", () => {
  for (const cls of ["sx-notice__close", "sx-upload__btn", "sx-notice--success", "card", "btn-bg"]) {
    assert.equal(isOverlayClass(cls), false, `${cls} wrongly treated as an overlay mark`);
  }
});

// ---------------------------------------------------------------------------------------------
//  Drift guards. The class names and the filter that must ignore them are ONE decision; a literal
//  spelled at the point of use is how they come apart. These read the source because the coupling
//  is textual — there is no runtime moment at which a forgotten literal announces itself.
// ---------------------------------------------------------------------------------------------

test("the overlay stamps page elements via the constants, never a class literal", () => {
  const src = read("../edit-overlay.tsx");
  const literals = [...src.matchAll(/classList\.(?:add|remove|toggle)\(\s*(["'`])(.*?)\1/g)].map(
    (m) => m[2],
  );
  assert.deepEqual(
    literals,
    [],
    `classList literal(s) ${JSON.stringify(literals)} bypass overlay-classes.ts — a mark spelled ` +
      `here is invisible to asSegment's filter and will poison generated selectors`,
  );
});

test("the reserved prefix is unused by the page itself", () => {
  // If the page ever shipped a real `sx-ov-*` class, asSegment would silently refuse to anchor it.
  // `sx-` itself is NOT reservable — the page legitimately owns .sx-notice*/.sx-upload*.
  // Scan the whole page tree, not just globals.css: page classes are also written inline in TSX
  // (lead-form-notice.tsx, lead-upload-field.tsx), so a stylesheet-only check would miss them.
  const appDir = fileURLToPath(new URL("../../..", import.meta.url));
  const offenders = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules" && e.name !== "editor") walk(full); // editor/ owns the prefix
      } else if (/\.(tsx?|css|mjs)$/.test(e.name) && readFileSync(full, "utf8").includes(OVERLAY_CLASS_PREFIX)) {
        offenders.push(relative(appDir, full));
      }
    }
  };
  walk(appDir);
  assert.deepEqual(offenders, [], `page source claims the overlay-reserved \`${OVERLAY_CLASS_PREFIX}\` namespace`);
});

test("the colour-hover affordance CSS targets the constant it is written for", () => {
  // edit-mode.ts paints the mark that edit-overlay.tsx applies; if these two names part company the
  // affordance simply stops painting, with nothing else failing.
  assert.ok(MODE_AFFORDANCE_CSS.includes(`.${CLASS_COLOR_HOVER}`));
});

test("no stale pre-fix class names survive anywhere in the editor", () => {
  // The old unprefixed names are exactly what the C1/I1 fix retired. A reappearance means someone
  // reintroduced a page-stamped mark outside the reserved namespace.
  for (const rel of ["../edit-overlay.tsx", "./edit-mode.ts", "./color-engine.ts"]) {
    const src = read(rel);
    for (const stale of ["sx-color-hover", "sx-flash"]) {
      // The flash KEYFRAME is still named sx-flash — that is an animation name, not a class, and it
      // never lands on an element. Only a class-position use is a defect.
      const asClass = new RegExp(`\\.${stale}\\b|["'\`]${stale}["'\`]`);
      assert.ok(!asClass.test(src), `${rel} still uses the retired class ${stale}`);
    }
  }
});

test("the constants are distinct and non-empty", () => {
  assert.notEqual(CLASS_COLOR_HOVER, CLASS_FLASH);
  // Both halves need the length floor: an empty list is trivially duplicate-free, so the Set check
  // alone would keep passing after someone emptied the very list it exists to police.
  assert.ok(OVERLAY_PAGE_CLASSES.length > 0);
  assert.equal(new Set(OVERLAY_PAGE_CLASSES).size, OVERLAY_PAGE_CLASSES.length);
});
