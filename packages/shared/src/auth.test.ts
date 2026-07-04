import { describe, it, expect } from "vitest";
import {
  usernameSchema,
  loginSchema,
  createUserSchema,
  ROLE_RANK,
  ROLE_NAMES,
  atLeast,
} from "./auth";

describe("loginSchema", () => {
  it("accepts a valid username + non-empty password", () => {
    expect(loginSchema.safeParse({ username: "admin", password: "secret" }).success).toBe(true);
  });
  it("rejects an invalid username and an empty password", () => {
    expect(loginSchema.safeParse({ username: "ab", password: "secret" }).success).toBe(false);
    expect(loginSchema.safeParse({ username: "admin", password: "" }).success).toBe(false);
  });
});

describe("createUserSchema", () => {
  it("requires username/name/password(min 8)/role", () => {
    expect(
      createUserSchema.safeParse({ username: "admin", name: "Ann", password: "longenough", role: "ADMIN" }).success,
    ).toBe(true);
    expect(
      createUserSchema.safeParse({ username: "admin", name: "Ann", password: "short", role: "ADMIN" }).success,
    ).toBe(false);
    expect(
      createUserSchema.safeParse({ username: "admin", name: "Ann", password: "longenough", role: "ROOT" }).success,
    ).toBe(false);
  });
  it("defaults role to EDITOR", () => {
    const out = createUserSchema.parse({ username: "admin", name: "Ann", password: "longenough" });
    expect(out.role).toBe("EDITOR");
  });
});

describe("usernameSchema", () => {
  it("accepts a valid lowercase handle", () => {
    expect(usernameSchema.parse("ealflm")).toBe("ealflm");
  });
  it("lowercases + trims input", () => {
    expect(usernameSchema.parse("  Admin  ")).toBe("admin");
  });
  it("rejects too-short (<3)", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
  });
  it("rejects illegal characters (spaces, @)", () => {
    expect(usernameSchema.safeParse("a b").success).toBe(false);
    expect(usernameSchema.safeParse("a@b").success).toBe(false);
  });
  it("loginSchema takes username + password", () => {
    expect(loginSchema.parse({ username: "Admin", password: "x" })).toEqual({
      username: "admin",
      password: "x",
    });
  });
  it("createUserSchema takes username (no email)", () => {
    const out = createUserSchema.parse({
      username: "newbie",
      name: "New",
      password: "pw123456",
      role: "EDITOR",
    });
    expect(out.username).toBe("newbie");
    expect("email" in out).toBe(false);
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
