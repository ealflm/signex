import { describe, it, expect } from "vitest";
import {
  countActiveAdmins,
  isLastActiveAdmin,
  deactivateBlockReason,
  type UserLike,
} from "./user-policy";

const users: UserLike[] = [
  { id: "a", role: "ADMIN", isActive: true },
  { id: "b", role: "ADMIN", isActive: false },
  { id: "c", role: "EDITOR", isActive: true },
  { id: "d", role: "ADMIN", isActive: true },
];

describe("countActiveAdmins", () => {
  it("counts only ADMIN users that are active", () => {
    expect(countActiveAdmins(users)).toBe(2);
  });
});

describe("isLastActiveAdmin", () => {
  it("is true when the user is the sole active admin", () => {
    expect(isLastActiveAdmin({ id: "a", role: "ADMIN", isActive: true }, 1)).toBe(true);
  });
  it("is false when another active admin exists", () => {
    expect(isLastActiveAdmin({ id: "a", role: "ADMIN", isActive: true }, 2)).toBe(false);
  });
  it("is false for a non-admin even when the count is 1", () => {
    expect(isLastActiveAdmin({ id: "c", role: "EDITOR", isActive: true }, 1)).toBe(false);
  });
  it("is false for an already-inactive admin", () => {
    expect(isLastActiveAdmin({ id: "b", role: "ADMIN", isActive: false }, 1)).toBe(false);
  });
});

describe("deactivateBlockReason", () => {
  it("blocks deactivating your own account", () => {
    expect(
      deactivateBlockReason({ isSelf: true, lastActiveAdmin: false }),
    ).toMatch(/your own account/i);
  });
  it("blocks deactivating the last active admin", () => {
    expect(
      deactivateBlockReason({ isSelf: false, lastActiveAdmin: true }),
    ).toMatch(/last active admin/i);
  });
  it("returns null when deactivation is allowed", () => {
    expect(
      deactivateBlockReason({ isSelf: false, lastActiveAdmin: false }),
    ).toBeNull();
  });
});
