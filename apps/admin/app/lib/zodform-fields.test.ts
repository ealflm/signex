import { describe, it, expect } from "vitest";
import { z, BLOCK_REGISTRY } from "@signex/shared";
import { deriveFields } from "./zodform-fields";

const localized = z.object({ en: z.string(), vi: z.string() });
const localizedArray = z.object({ en: z.array(z.string()), vi: z.array(z.string()) });
const assetRef = z.object({ assetId: z.string(), alt: localized.optional() });

describe("deriveFields", () => {
  it("classifies a plain string field", () => {
    const plan = deriveFields(z.object({ brand: z.string() }));
    expect(plan).toContainEqual({ name: "brand", kind: "string", label: "brand" });
  });

  it("classifies a localized {en,vi} field", () => {
    const plan = deriveFields(z.object({ title: localized }));
    expect(plan.find((f) => f.name === "title")?.kind).toBe("localized");
  });

  it("classifies a localized string-array field", () => {
    const plan = deriveFields(z.object({ bullets: localizedArray }));
    expect(plan.find((f) => f.name === "bullets")?.kind).toBe("localizedArray");
  });

  it("classifies an AssetRef field", () => {
    const plan = deriveFields(z.object({ image: assetRef }));
    expect(plan.find((f) => f.name === "image")?.kind).toBe("assetRef");
  });

  it("classifies an array-of-objects as a repeater with children", () => {
    const plan = deriveFields(z.object({ cards: z.array(z.object({ title: localized })) }));
    const cards = plan.find((f) => f.name === "cards");
    expect(cards?.kind).toBe("array");
    expect(cards?.children?.[0]).toMatchObject({ name: "title", kind: "localized" });
  });

  it("falls back to json for shapes it cannot cleanly model", () => {
    const plan = deriveFields(z.object({ weird: z.union([z.string(), z.number()]) }));
    expect(plan.find((f) => f.name === "weird")?.kind).toBe("json");
  });

  it("unwraps optional/default wrappers", () => {
    const plan = deriveFields(z.object({ note: z.string().optional(), tags: z.array(z.string()).default([]) }));
    expect(plan.find((f) => f.name === "note")?.kind).toBe("string");
  });

  it("derives a non-empty plan for every real BLOCK_REGISTRY entry", () => {
    for (const [key, schema] of Object.entries(BLOCK_REGISTRY)) {
      const plan = deriveFields(schema as z.ZodTypeAny);
      expect(plan.length, `block ${key} should derive fields`).toBeGreaterThan(0);
    }
  });
});
