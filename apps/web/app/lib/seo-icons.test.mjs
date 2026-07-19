// Run from apps/web: `jiti app/lib/seo-icons.test.mjs`
import assert from "node:assert/strict";
import { iconsFrom, ICONS } from "./seo-icons";

// Empty/absent favicons → the static bundled set (unchanged behaviour).
assert.deepEqual(iconsFrom([]), ICONS);
assert.deepEqual(iconsFrom(undefined), ICONS);

// Configured favicons → icon list from the snapshot; apple-touch-icon maps to icons.apple.
const out = iconsFrom([
  { rel: "icon", url: "https://cdn/x-32.png" },
  { rel: "icon", url: "https://cdn/x-16.png" },
  { rel: "apple-touch-icon", url: "https://cdn/apple.png" },
]);
assert.deepEqual(out.icon, [{ url: "https://cdn/x-32.png" }, { url: "https://cdn/x-16.png" }]);
assert.equal(out.apple, "https://cdn/apple.png");

// No apple entry → no apple key (Next would emit an empty tag otherwise).
assert.equal(Object.hasOwn(iconsFrom([{ rel: "icon", url: "https://cdn/only.png" }]), "apple"), false);

console.log("seo-icons: all assertions passed");
