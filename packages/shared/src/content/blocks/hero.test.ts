import { describe, expect, it } from "vitest";
import { heroBlock } from "./hero";

// `.pick` keeps the fixture to the two NEW fields — no need to invent a valid MediaRef.
const slim = heroBlock.pick({ showQuoteForm: true, formLabelColor: true });

describe("heroBlock r3 fields", () => {
  it("defaults showQuoteForm to true and leaves formLabelColor absent", () => {
    expect(slim.parse({})).toEqual({ showQuoteForm: true });
  });
  it("accepts an explicit hide + a HexA colour (alpha allowed)", () => {
    expect(slim.parse({ showQuoteForm: false, formLabelColor: "#ff8800cc" })).toEqual({
      showQuoteForm: false,
      formLabelColor: "#ff8800cc",
    });
  });
  it("rejects a non-hex formLabelColor", () => {
    expect(() => slim.parse({ formLabelColor: "red" })).toThrow();
  });
  it("carries the admin colour-picker marker", () => {
    expect(heroBlock.shape.formLabelColor.unwrap().description).toBe("color");
  });
});
