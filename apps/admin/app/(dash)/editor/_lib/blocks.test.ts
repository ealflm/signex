import { describe, it, expect } from "vitest";
// Relative, NOT "@/…": apps/admin/vitest.config.ts sets no resolve.alias (see modes.test.ts).
import { isBlockKey, parseCanvasField, BLOCK_LABELS, SURFACE_PATH_BY_BLOCK } from "./blocks";
import { BLOCK_KEYS } from "@signex/shared";

describe("isBlockKey", () => {
  it("accepts every block in the registry", () => {
    for (const k of BLOCK_KEYS) expect(isBlockKey(k)).toBe(true);
  });

  it("rejects what the canvas can actually send", () => {
    // The overlay reports "" for an element outside any [data-sx-block], and the bridge proves
    // origin and nothing else — so a wrong/renamed key is a string like any other. Selecting one
    // would hand BLOCK_REGISTRY[k] → undefined to deriveFields and crash the editor.
    expect(isBlockKey("")).toBe(false);
    expect(isBlockKey("heroo")).toBe(false);
    expect(isBlockKey(undefined)).toBe(false);
    expect(isBlockKey(null)).toBe(false);
    expect(isBlockKey(42)).toBe(false);
  });

  it("rejects Object.prototype keys — the `in` trap", () => {
    // `"toString" in BLOCK_REGISTRY` is TRUE. Written with `in`, this guard would wave through
    // every prototype member and the crash it exists to prevent would be one click away.
    expect(isBlockKey("toString")).toBe(false);
    expect(isBlockKey("constructor")).toBe(false);
    expect(isBlockKey("__proto__")).toBe(false);
  });
});

describe("parseCanvasField", () => {
  it("splits a canvas field into a proven block key and the path WITHIN it", () => {
    // The block key is never part of the path: the panel addresses a field by its within-block
    // dotted name, so leaking the key in would match nothing (and, on the textEdit path, would
    // write to the wrong address).
    expect(parseCanvasField("hero.image")).toEqual({ blockKey: "hero", path: ["image"] });
    expect(parseCanvasField("features.video.media")).toEqual({
      blockKey: "features",
      path: ["video", "media"],
    });
  });

  it("yields an EMPTY path, not [\"\"], for a bare block key", () => {
    // "".split(".") is [""], which would address a child named "" — the reason path is segments
    // rather than a string the callers re-split.
    expect(parseCanvasField("hero")).toEqual({ blockKey: "hero", path: [] });
  });

  it("rejects every key isBlockKey rejects — the guard is not per-branch", () => {
    // The whole point of the shared parse: `highlight` cast this unguarded and fed
    // deriveFields(BLOCK_REGISTRY[k]) → undefined, crashing the editor. Untrusted-ness is a
    // property of the BRIDGE, not of which branch happens to look reachable.
    expect(parseCanvasField("heroo.image")).toBeNull();
    expect(parseCanvasField(".image")).toBeNull(); // "" — an element outside any [data-sx-block]
    expect(parseCanvasField("")).toBeNull();
    expect(parseCanvasField("__proto__.image")).toBeNull();
    expect(parseCanvasField("toString.x")).toBeNull();
    expect(parseCanvasField(undefined)).toBeNull();
    expect(parseCanvasField(null)).toBeNull();
    expect(parseCanvasField(42)).toBeNull();
    expect(parseCanvasField({ blockKey: "hero" })).toBeNull();
  });

  it("accepts a field under every block in the registry", () => {
    for (const k of BLOCK_KEYS) expect(parseCanvasField(`${k}.x`)?.blockKey).toBe(k);
  });
});

describe("block tables", () => {
  // Both are Record<BlockKey, …>, so a MISSING key is a type error — but an object literal cast
  // (BLOCK_LABELS is `as Record<…>`, derived from SURFACE_GROUPS) is not checked that way, and a
  // block the rail forgot silently loses its label and its surface.
  it("cover every block in the registry", () => {
    expect(Object.keys(BLOCK_LABELS).sort()).toEqual([...BLOCK_KEYS].sort());
    expect(Object.keys(SURFACE_PATH_BY_BLOCK).sort()).toEqual([...BLOCK_KEYS].sort());
  });
});
