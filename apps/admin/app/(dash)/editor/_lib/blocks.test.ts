import { describe, it, expect } from "vitest";
// Relative, NOT "@/…": apps/admin/vitest.config.ts sets no resolve.alias (see modes.test.ts).
import { isBlockKey, BLOCK_LABELS, SURFACE_PATH_BY_BLOCK } from "./blocks";
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

describe("block tables", () => {
  // Both are Record<BlockKey, …>, so a MISSING key is a type error — but an object literal cast
  // (BLOCK_LABELS is `as Record<…>`, derived from SURFACE_GROUPS) is not checked that way, and a
  // block the rail forgot silently loses its label and its surface.
  it("cover every block in the registry", () => {
    expect(Object.keys(BLOCK_LABELS).sort()).toEqual([...BLOCK_KEYS].sort());
    expect(Object.keys(SURFACE_PATH_BY_BLOCK).sort()).toEqual([...BLOCK_KEYS].sort());
  });
});
