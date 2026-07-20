import { describe, it, expect } from "vitest";
import * as shared from "./index";

describe("@signex/shared barrel", () => {
  it("keeps the existing contactMessageSchema + z", () => {
    expect(typeof shared.contactMessageSchema.parse).toBe("function");
    expect(typeof shared.z.object).toBe("function");
  });
  it("re-exports the registry + parseBlock + snapshot + auth", () => {
    expect(Object.keys(shared.BLOCK_REGISTRY).length).toBe(13);
    expect(typeof shared.parseBlock).toBe("function");
    expect(typeof shared.ReleaseSnapshotSchema.parse).toBe("function");
    expect(shared.ROLE_RANK.ADMIN).toBe(3);
    expect(shared.atLeast("ADMIN", "EDITOR")).toBe(true);
  });
  it("re-exports primitives + catalog DTOs", () => {
    expect(typeof shared.LocalizedText.parse).toBe("function");
    expect(typeof shared.AssetRef.parse).toBe("function");
    expect(typeof shared.FrozenAsset.parse).toBe("function");
    expect(typeof shared.CategoryDTO.parse).toBe("function");
  });
});
