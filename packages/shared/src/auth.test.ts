import { describe, it, expect } from "vitest";
import {
  loginSchema,
  createUserSchema,
  ROLE_RANK,
  ROLE_NAMES,
  atLeast,
} from "./auth";

describe("loginSchema", () => {
  it("accepts a valid email + non-empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "secret" }).success).toBe(true);
  });
  it("rejects a bad email and an empty password", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "secret" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("createUserSchema", () => {
  it("requires email/name/password(min 8)/role", () => {
    expect(
      createUserSchema.safeParse({ email: "a@b.com", name: "Ann", password: "longenough", role: "ADMIN" }).success,
    ).toBe(true);
    expect(
      createUserSchema.safeParse({ email: "a@b.com", name: "Ann", password: "short", role: "ADMIN" }).success,
    ).toBe(false);
    expect(
      createUserSchema.safeParse({ email: "a@b.com", name: "Ann", password: "longenough", role: "ROOT" }).success,
    ).toBe(false);
  });
  it("defaults role to EDITOR", () => {
    const out = createUserSchema.parse({ email: "a@b.com", name: "Ann", password: "longenough" });
    expect(out.role).toBe("EDITOR");
  });
});

describe("ROLE_RANK / atLeast", () => {
  it("orders EDITOR < PUBLISHER < ADMIN", () => {
    expect(ROLE_RANK.EDITOR).toBe(1);
    expect(ROLE_RANK.PUBLISHER).toBe(2);
    expect(ROLE_RANK.ADMIN).toBe(3);
    expect(ROLE_NAMES).toEqual(["EDITOR", "PUBLISHER", "ADMIN"]);
  });
  it("atLeast compares ranks", () => {
    expect(atLeast("ADMIN", "PUBLISHER")).toBe(true);
    expect(atLeast("PUBLISHER", "PUBLISHER")).toBe(true);
    expect(atLeast("EDITOR", "PUBLISHER")).toBe(false);
  });
});
