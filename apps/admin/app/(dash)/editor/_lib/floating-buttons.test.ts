import { describe, it, expect } from "vitest";
import { BLOCK_REGISTRY } from "@signex/shared";
// Relative, NOT "@/…": apps/admin/vitest.config.ts sets no resolve.alias, so the @/ path alias
// resolves in the app (tsconfig paths + Next) but not under vitest (see modes.test.ts).
import { deriveFields } from "../../../lib/zodform-fields";
import { BLOCK_LABELS, SURFACE_PATH_BY_BLOCK } from "./blocks";

describe("floatingButtons admin surface", () => {
  it("is a labelled, global (null-path) settings block", () => {
    expect(BLOCK_LABELS.floatingButtons).toBe("Floating buttons");
    expect(SURFACE_PATH_BY_BLOCK.floatingButtons).toBe(null);
  });

  it("derives exactly two string fields (callHref, zaloHref)", () => {
    const fields = deriveFields(BLOCK_REGISTRY.floatingButtons);
    expect(fields.map((f) => f.name).sort()).toEqual(["callHref", "zaloHref"]);
    expect(fields.every((f) => f.kind === "string")).toBe(true);
  });
});
