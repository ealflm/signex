import { describe, it, expect } from "vitest";
import { z, BLOCK_REGISTRY } from "@signex/shared";
import { deriveFields } from "./zodform-fields";

const localized = z.object({ en: z.string(), vi: z.string() });
const localizedArray = z.object({ en: z.array(z.string()), vi: z.array(z.string()) });
const assetRef = z.object({ assetId: z.string(), alt: localized.optional() });
const videoRef = z.object({
  posterAssetId: z.string(),
  mp4AssetId: z.string(),
  webmAssetId: z.string().optional(),
});

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

  it("classifies a VideoRef field (poster/mp4/webm triple, distinct from AssetRef)", () => {
    const plan = deriveFields(z.object({ media: videoRef }));
    expect(plan.find((f) => f.name === "media")?.kind).toBe("videoRef");
  });

  it("does NOT classify a VideoRef as assetRef even though it has *AssetId keys", () => {
    // VideoRef has posterAssetId/mp4AssetId but no bare `assetId` — must not be mistaken for AssetRef.
    const plan = deriveFields(z.object({ media: videoRef }));
    expect(plan.find((f) => f.name === "media")?.kind).not.toBe("assetRef");
  });

  it("recurses ONE level into a plain object, classifying nested leaves (string/localized/assetRef/videoRef)", () => {
    const plan = deriveFields(
      z.object({
        featured: z.object({
          title: localized,
          href: z.string(),
          image: assetRef.optional(),
          video: videoRef.optional(),
        }),
      })
    );
    const featured = plan.find((f) => f.name === "featured");
    expect(featured?.kind).toBe("object");
    const byName = (n: string) => featured?.children?.find((c) => c.name === n)?.kind;
    expect(byName("title")).toBe("localized");
    expect(byName("href")).toBe("string");
    expect(byName("image")).toBe("assetRef");
    expect(byName("video")).toBe("videoRef");
  });

  it("does NOT recurse a SECOND level — nested-nested objects fall back to json (conservative scope)", () => {
    const plan = deriveFields(
      z.object({
        outer: z.object({
          inner: z.object({ a: z.string(), b: z.string() }), // depth 2 → json
          leaf: assetRef, // depth 1 leaf → assetRef
        }),
      })
    );
    const outer = plan.find((f) => f.name === "outer");
    expect(outer?.kind).toBe("object");
    expect(outer?.children?.find((c) => c.name === "inner")?.kind).toBe("json");
    expect(outer?.children?.find((c) => c.name === "leaf")?.kind).toBe("assetRef");
  });

  it("treats localized/localizedArray/assetRef/videoRef as leaves, NOT as recurse-able objects", () => {
    // These are ZodObjects too, but must keep their special kinds (no 'object' recursion).
    expect(deriveFields(z.object({ x: localized }))[0].kind).toBe("localized");
    expect(deriveFields(z.object({ x: localizedArray }))[0].kind).toBe("localizedArray");
    expect(deriveFields(z.object({ x: assetRef }))[0].kind).toBe("assetRef");
    expect(deriveFields(z.object({ x: videoRef }))[0].kind).toBe("videoRef");
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

  it("exposes proper editors for the newly-configurable block asset fields (no more raw JSON)", () => {
    const child = (plan: ReturnType<typeof deriveFields>, parent: string, name: string) =>
      plan.find((f) => f.name === parent)?.children?.find((c) => c.name === name)?.kind;

    // footer.logo — top-level assetRef
    const footer = deriveFields(BLOCK_REGISTRY.footer as z.ZodTypeAny);
    expect(footer.find((f) => f.name === "logo")?.kind).toBe("assetRef");

    // features.featured.image — nested assetRef ; features.video.media — nested videoRef
    const features = deriveFields(BLOCK_REGISTRY.features as z.ZodTypeAny);
    expect(child(features, "featured", "image")).toBe("assetRef");
    expect(child(features, "video", "media")).toBe("videoRef");

    // aboutPage.hero.video — nested videoRef ; aboutPage.testimonial.image — nested assetRef
    const aboutPage = deriveFields(BLOCK_REGISTRY.aboutPage as z.ZodTypeAny);
    expect(child(aboutPage, "hero", "video")).toBe("videoRef");
    expect(child(aboutPage, "testimonial", "image")).toBe("assetRef");
  });
});
