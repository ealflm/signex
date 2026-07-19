import { describe, it, expect } from "vitest";
import { pickerDefaultKind } from "./picker-default-kind";
describe("pickerDefaultKind", () => {
  it("opens on the stored kind when the slot holds something", () => {
    expect(pickerDefaultKind("video", "image")).toBe("video");
    expect(pickerDefaultKind("image", "video")).toBe("image");
  });
  it("falls back to the posted mediaKind for an empty slot", () => {
    expect(pickerDefaultKind(null, "image")).toBe("image");
    expect(pickerDefaultKind(null, "video")).toBe("video");
  });
});
