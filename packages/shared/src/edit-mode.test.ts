import { describe, it, expect } from "vitest";
import { EDIT_MODES, DEFAULT_EDIT_MODE, isEditMode } from "./edit-mode";

// This module exists to be the ONE declaration of the mode vocabulary for two workspaces that
// cannot see each other's types. These tests pin the properties both sides are entitled to assume.

describe("edit mode vocabulary", () => {
  it("is exactly the four modes, in canvas order", () => {
    expect([...EDIT_MODES]).toEqual(["media", "text", "color", "content"]);
  });

  it("uses the American 'color' spelling, per the repo's identifier convention", () => {
    // Prose says "colour"; identifiers and wire values say "color". This value crosses a bridge —
    // if it ever became "colour" the admin would post a mode the overlay drops on the floor.
    expect(EDIT_MODES as readonly string[]).toContain("color");
    expect(EDIT_MODES as readonly string[]).not.toContain("colour");
  });

  it("boots in content, so the editor opens as it did before modes existed", () => {
    expect(DEFAULT_EDIT_MODE).toBe("content");
    expect(EDIT_MODES as readonly string[]).toContain(DEFAULT_EDIT_MODE);
  });

  it("isEditMode accepts every mode in the vocabulary", () => {
    expect(EDIT_MODES.length).toBeGreaterThan(0);
    for (const mode of EDIT_MODES) expect(isEditMode(mode)).toBe(true);
  });

  it("isEditMode rejects anything that is not one of the four", () => {
    // setMode arrives over postMessage from another window, so `typeof v === "string"` is NOT
    // validation of it. An unrecognised value would be written to body.dataset.sxMode, match no
    // gate, and leave dispatch in a state no branch owns.
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
      expect(isEditMode(junk), JSON.stringify(junk) ?? String(junk)).toBe(false);
    }
  });
});
