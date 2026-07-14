import { describe, it, expect } from "vitest";
import { EDIT_MODES, EDIT_MODE_KEYS, DEFAULT_MODE } from "./modes";

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
