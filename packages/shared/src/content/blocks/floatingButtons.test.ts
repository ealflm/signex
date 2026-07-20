import { describe, it, expect } from "vitest";
import { floatingButtonsBlock } from "./floatingButtons";

describe("floatingButtonsBlock", () => {
  it("defaults the whole block when the key is absent (undefined)", () => {
    expect(floatingButtonsBlock.parse(undefined)).toEqual({ callHref: "", zaloHref: "" });
  });

  it("fills both leaves from a partial object", () => {
    expect(floatingButtonsBlock.parse({})).toEqual({ callHref: "", zaloHref: "" });
    expect(floatingButtonsBlock.parse({ callHref: "tel:+84979700072" })).toEqual({
      callHref: "tel:+84979700072",
      zaloHref: "",
    });
  });

  it("keeps provided values verbatim (no URL validation)", () => {
    expect(floatingButtonsBlock.parse({ callHref: "0979700072", zaloHref: "https://zalo.me/g/abc" })).toEqual({
      callHref: "0979700072",
      zaloHref: "https://zalo.me/g/abc",
    });
  });
});
