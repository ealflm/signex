import { describe, it, expect } from "vitest";
import { EDIT_MODES, EDIT_MODE_KEYS, DEFAULT_MODE, MODE_LENS, isMediaField, isTextField } from "./modes";
// Relative, NOT "@/…": apps/admin/vitest.config.ts sets no resolve.alias, so the @/ path alias
// resolves in the app (tsconfig paths + Next) but not under vitest. Every existing admin test
// imports relatively for this reason. (A type-only "@/…" import inside modes.ts is fine — it is
// erased before esbuild ever has to resolve it.)
import { deriveFields } from "../../../lib/zodform-fields";
import { BLOCK_REGISTRY } from "@signex/shared";

describe("edit modes", () => {
  it("has exactly the four modes, in canvas order", () => {
    expect(EDIT_MODES.map((m) => m.key)).toEqual(["media", "text", "color", "content"]);
  });

  it("opens in Content so the editor behaves as it did before modes", () => {
    expect(DEFAULT_MODE).toBe("content");
  });

  it("labels are Vietnamese and unique", () => {
    const labels = EDIT_MODES.map((m) => m.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("Màu");
  });

  // ---------------------------------------------------------------------------------------------
  //  The cross-workspace contract. The vocabulary now comes from @signex/shared, so a DRIFTED
  //  spelling is a type error on both sides and cannot reach here. What the type system does NOT
  //  catch is the other half: `as const satisfies readonly { key: EditMode }[]` proves each key IS
  //  a mode, but never that every mode HAS a button. Dropping one from the list below still
  //  typechecks, still passes the three tests above, and simply removes a mode from the toolbar
  //  with no way left to reach it — the same silent failure, one level down.
  // ---------------------------------------------------------------------------------------------

  it("gives every mode in the shared vocabulary exactly one button", () => {
    expect([...EDIT_MODES.map((m) => m.key)].sort()).toEqual([...EDIT_MODE_KEYS].sort());
  });

  it("boots in a mode the shared vocabulary actually contains", () => {
    // A default outside the vocabulary is the one value the overlay's isEditMode guard cannot save
    // us from: it is never posted, so the preview boots to its own default and the toolbar silently
    // disagrees with the canvas from the first frame.
    expect(EDIT_MODE_KEYS as readonly string[]).toContain(DEFAULT_MODE);
  });
});

describe("field classifiers", () => {
  // Probed against the real registry rather than assumed:
  //   hero → titleTop/titleBottom/subtitle are `localized`, image is `assetRef`.
  const heroFields = deriveFields(BLOCK_REGISTRY.hero);

  it("Media mode lists the hero image and no strings", () => {
    const names = heroFields.filter(isMediaField).map((f) => f.name);
    expect(names).toContain("image");
    expect(names).not.toContain("titleTop");
  });

  it("Text mode lists the hero strings and no media", () => {
    const names = heroFields.filter(isTextField).map((f) => f.name);
    expect(names).toContain("titleTop");
    expect(names).not.toContain("image");
  });

  it("every field lands in at most one visual mode", () => {
    for (const f of heroFields) expect(isMediaField(f) && isTextField(f)).toBe(false);
  });

  it("claims no container: an object/array may hold BOTH kinds of leaf", () => {
    // features.cards is `array`, features.title is `object`. Neither predicate may claim them —
    // FieldEditor renders a container whole, so keeping one would smuggle its non-matching leaves
    // into the lens. They stay reachable in Content mode, which is what that mode is for.
    const features = deriveFields(BLOCK_REGISTRY.features);
    const containers = features.filter((f) => f.kind === "array" || f.kind === "object");
    expect(containers.length).toBeGreaterThan(0);
    for (const f of containers) {
      expect(isMediaField(f)).toBe(false);
      expect(isTextField(f)).toBe(false);
    }
  });
});

describe("mode lens", () => {
  it("gives Media and Text a filtered form with its own Vietnamese title", () => {
    expect(MODE_LENS.media?.title).toBe("Hình ảnh & video");
    expect(MODE_LENS.text?.title).toBe("Nội dung chữ");
    expect(deriveFields(BLOCK_REGISTRY.hero).filter(MODE_LENS.media!.filter).map((f) => f.name)).toEqual([
      "image",
    ]);
  });

  it("leaves Content unfiltered, so the form is exactly what it was before modes existed", () => {
    expect(MODE_LENS.content).toBeNull();
  });

  it("leaves Colour unfiltered too — ColorPanel replaces that zone, it does not filter it", () => {
    expect(MODE_LENS.color).toBeNull();
  });
});
