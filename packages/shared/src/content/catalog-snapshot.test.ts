import { describe, it, expect } from "vitest";
import {
  CatalogSnapshotSchema,
  CATALOG_SCHEMA_VERSION,
} from "./catalog";

const CUID = "clr1abcd0000xyz1234567890";
const L = (s: string) => ({ en: s, vi: s });

const IMAGE = {
  assetId: CUID,
  r2Key: "originals/ab/cat.jpg",
  mime: "image/jpeg",
};

const CATEGORY = {
  slug: "plastic-logos-emblems",
  sortOrder: 0,
  title: L("Plastic logos"),
  tag: L("PVC"),
  intro: L("Intro"),
  productCount: 18,
  materialCount: 4,
  image: IMAGE,
  items: [
    {
      slug: "soft-pvc-logo-patch",
      sortOrder: 0,
      title: L("Soft-PVC logo patch"),
      tag: L("Soft PVC"),
      desc: L("Description"),
      image: IMAGE,
    },
  ],
};

describe("CatalogSnapshotSchema", () => {
  it("exposes CATALOG_SCHEMA_VERSION = 1, independent of content SCHEMA_VERSION", () => {
    expect(CATALOG_SCHEMA_VERSION).toBe(1);
  });

  it("parses an empty catalog snapshot", () => {
    const r = CatalogSnapshotSchema.safeParse({
      catalogSchemaVersion: 1,
      categories: [],
    });
    expect(r.success).toBe(true);
  });

  it("parses a snapshot with one category + one product (inline images)", () => {
    const r = CatalogSnapshotSchema.safeParse({
      catalogSchemaVersion: 1,
      categories: [CATEGORY],
    });
    if (!r.success) console.error(JSON.stringify(r.error.format(), null, 2));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.categories).toHaveLength(1);
      expect(r.data.categories[0].items).toHaveLength(1);
      // inline image variants default to []
      expect(r.data.categories[0].image?.variants).toEqual([]);
    }
  });

  it("requires the catalogSchemaVersion literal (no version stamp → reject)", () => {
    const r = CatalogSnapshotSchema.safeParse({ categories: [] });
    expect(r.success).toBe(false);
  });

  it("rejects a wrong catalogSchemaVersion", () => {
    const r = CatalogSnapshotSchema.safeParse({
      catalogSchemaVersion: 2,
      categories: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a category image missing r2Key (inline FrozenAsset validation)", () => {
    const r = CatalogSnapshotSchema.safeParse({
      catalogSchemaVersion: 1,
      categories: [{ ...CATEGORY, image: { assetId: CUID, mime: "image/jpeg" } }],
    });
    expect(r.success).toBe(false);
  });

  it("has NO assets map (catalog images are inline / self-contained)", () => {
    expect(Object.keys(CatalogSnapshotSchema.shape)).not.toContain("assets");
  });
});
