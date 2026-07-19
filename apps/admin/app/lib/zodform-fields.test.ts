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

  it("classifies a MediaRef (z.union([AssetRef, VideoRef])) as mediaRef, not json", () => {
    // A MediaRef IS a z.ZodUnion, so this also pins the ordering requirement: it must be caught
    // BEFORE the generic union→json fallback ("falls back to json for shapes it cannot cleanly
    // model" below), or a flexible image-OR-video slot silently degrades to a raw-JSON textarea.
    const plan = deriveFields(z.object({ m: z.union([assetRef, videoRef]) }));
    expect(plan.find((f) => f.name === "m")?.kind).toBe("mediaRef");
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

  it("recurses plain objects up to MAX_OBJECT_DEPTH (3); deeper nesting falls back to json", () => {
    const plan = deriveFields(
      z.object({
        l0: z.object({
          l1: z.object({
            l2: z.object({
              l3: z.object({ a: z.string(), b: z.string() }), // depth 3 → json (too deep)
              leaf: assetRef, // depth 3 leaf → assetRef (special kinds resolve at any depth)
            }),
          }),
        }),
      })
    );
    const l0 = plan.find((f) => f.name === "l0");
    expect(l0?.kind).toBe("object"); // depth 0
    const l1 = l0?.children?.find((c) => c.name === "l1");
    expect(l1?.kind).toBe("object"); // depth 1
    const l2 = l1?.children?.find((c) => c.name === "l2");
    expect(l2?.kind).toBe("object"); // depth 2
    expect(l2?.children?.find((c) => c.name === "l3")?.kind).toBe("json"); // depth 3 → too deep
    expect(l2?.children?.find((c) => c.name === "leaf")?.kind).toBe("assetRef");
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

    // footer.logo — top-level assetRef (unchanged: still a plain AssetRef, not a flexible slot)
    const footer = deriveFields(BLOCK_REGISTRY.footer as z.ZodTypeAny);
    expect(footer.find((f) => f.name === "logo")?.kind).toBe("assetRef");

    // features.featured.image and features.video.media are now flexible (image OR video) slots —
    // both AssetRef and VideoRef were widened to MediaRef, so both classify as mediaRef.
    const features = deriveFields(BLOCK_REGISTRY.features as z.ZodTypeAny);
    expect(child(features, "featured", "image")).toBe("mediaRef");
    expect(child(features, "video", "media")).toBe("mediaRef");

    // aboutPage.hero.video is now a flexible slot (mediaRef) ; aboutPage.testimonial.image is
    // unchanged — still a plain AssetRef.
    const aboutPage = deriveFields(BLOCK_REGISTRY.aboutPage as z.ZodTypeAny);
    expect(child(aboutPage, "hero", "video")).toBe("mediaRef");
    expect(child(aboutPage, "testimonial", "image")).toBe("assetRef");
  });
});
