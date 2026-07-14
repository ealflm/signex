import { describe, it, expect } from "vitest";
import { EDIT_MODES, DEFAULT_MODE } from "./modes";

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
});
