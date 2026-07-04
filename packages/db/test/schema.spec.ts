import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, Role, ReleaseStatus } from "../generated/client";

// SAFETY: this suite runs `prisma migrate reset` (DESTRUCTIVE — drops ALL data). To ensure it can
// NEVER wipe a dev/prod database (it once did, via `npm run test` against the dev DATABASE_URL), it
// targets a dedicated TEST_DATABASE_URL and is SKIPPED entirely when that is unset. CI / deliberate
// integration runs set TEST_DATABASE_URL to an isolated throwaway database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const runIntegration = Boolean(TEST_DATABASE_URL);
if (!runIntegration) {
  // eslint-disable-next-line no-console
  console.warn(
    "[@signex/db] schema.spec SKIPPED — set TEST_DATABASE_URL (a dedicated throwaway DB) to run the destructive migration/integration tests.",
  );
}
const describeIntegration = runIntegration ? describe : describe.skip;

const prisma = new PrismaClient(
  TEST_DATABASE_URL ? { datasources: { db: { url: TEST_DATABASE_URL } } } : undefined,
);

beforeAll(() => {
  if (!runIntegration) return; // never reset a DB unless TEST_DATABASE_URL explicitly opts in
  // Clean DB from the committed migration ONLY (no seed) — proves a fresh apply, against the TEST DB.
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes",
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeUser() {
  return prisma.user.create({
    data: { username: `u${Date.now()}`, name: "Seed", passwordHash: "x" },
  });
}

async function makeRelease(version: number, createdById: string, status: ReleaseStatus) {
  return prisma.release.create({
    data: {
      version,
      status,
      snapshot: {},
      checksum: `c${version}`,
      schemaVersion: 1,
      fromRevision: 0,
      createdById,
    },
  });
}

async function makeCatalogRelease(version: number, createdById: string, status: ReleaseStatus) {
  return prisma.catalogRelease.create({
    data: {
      version,
      status,
      snapshot: {},
      checksum: `cc${version}`,
      schemaVersion: 1,
      fromRevision: 0,
      createdById,
    },
  });
}

describeIntegration("cms_foundation migration", () => {
  it("exposes the Role enum members EDITOR/PUBLISHER/ADMIN", () => {
    expect(Role).toMatchObject({ EDITOR: "EDITOR", PUBLISHER: "PUBLISHER", ADMIN: "ADMIN" });
  });

  it("defaults the singleton ids to 'singleton'", async () => {
    const ws = await prisma.workingState.create({ data: {} });
    expect(ws.id).toBe("singleton");
    expect(ws.revision).toBe(0);
    expect(ws.lastPublishedRevision).toBe(0);
  });

  it("has a monotonic release_version_seq", async () => {
    const a = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('release_version_seq')`;
    const b = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('release_version_seq')`;
    expect(Number(b[0].nextval)).toBe(Number(a[0].nextval) + 1);
  });

  it("enforces unique Release.version (monotonic-version invariant)", async () => {
    const u = await makeUser();
    await makeRelease(1, u.id, ReleaseStatus.ARCHIVED);
    await expect(makeRelease(1, u.id, ReleaseStatus.PUBLISHED)).rejects.toThrow();
  });

  it("enforces the single-PublishedPointer invariant via @id singleton + releaseId @unique", async () => {
    const u = await makeUser();
    const r2 = await makeRelease(2, u.id, ReleaseStatus.PUBLISHED);
    const r3 = await makeRelease(3, u.id, ReleaseStatus.PUBLISHED);
    await prisma.publishedPointer.create({
      data: { releaseId: r2.id, publishedVersion: 2, publishedById: u.id },
    });
    // A second pointer row collides on the singleton PK -> exactly one LIVE release.
    await expect(
      prisma.publishedPointer.create({
        data: { releaseId: r3.id, publishedVersion: 3, publishedById: u.id },
      }),
    ).rejects.toThrow();
  });

  it("stores BigInt Asset.bytes without precision loss", async () => {
    const a = await prisma.asset.create({
      data: {
        kind: "IMAGE",
        sha256: `s${Date.now()}`,
        r2Key: `k${Date.now()}`,
        mime: "image/png",
        bytes: 9_000_000_000n,
        originalName: "big.png",
      },
    });
    expect(a.bytes).toBe(9_000_000_000n);
  });

  it("enforces Asset.sha256 unique constraint", async () => {
    const ts = Date.now();
    await prisma.asset.create({
      data: {
        kind: "IMAGE",
        sha256: `sha-unique-${ts}`,
        r2Key: `r2-key-a-${ts}`,
        mime: "image/png",
        bytes: 1n,
        originalName: "a.png",
      },
    });
    await expect(
      prisma.asset.create({
        data: {
          kind: "IMAGE",
          sha256: `sha-unique-${ts}`, // same sha256
          r2Key: `r2-key-b-${ts}`,    // different r2Key
          mime: "image/png",
          bytes: 2n,
          originalName: "b.png",
        },
      }),
    ).rejects.toThrow();
  });

  it("enforces Asset.r2Key unique constraint", async () => {
    const ts = Date.now();
    await prisma.asset.create({
      data: {
        kind: "IMAGE",
        sha256: `sha-r2-a-${ts}`,
        r2Key: `r2-key-unique-${ts}`,
        mime: "image/png",
        bytes: 1n,
        originalName: "c.png",
      },
    });
    await expect(
      prisma.asset.create({
        data: {
          kind: "IMAGE",
          sha256: `sha-r2-b-${ts}`, // different sha256
          r2Key: `r2-key-unique-${ts}`, // same r2Key
          mime: "image/png",
          bytes: 2n,
          originalName: "d.png",
        },
      }),
    ).rejects.toThrow();
  });

  it("enforces ContentBlock(kind, key) composite unique constraint", async () => {
    await prisma.contentBlock.create({
      data: { kind: "PAGE", key: "home.hero", data: {} },
    });
    await expect(
      prisma.contentBlock.create({
        data: { kind: "PAGE", key: "home.hero", data: { title: "duplicate" } },
      }),
    ).rejects.toThrow();
  });

  it("enforces Product(categoryId, slug) composite unique constraint", async () => {
    const cat = await prisma.category.create({
      data: {
        slug: `cat-slug-${Date.now()}`,
        sortOrder: 99,
        title: { en: "Cat", vi: "Cat" },
        tag: { en: "Tag", vi: "Tag" },
        intro: { en: "Intro", vi: "Intro" },
        productCount: 1,
        materialCount: 1,
      },
    });
    await prisma.product.create({
      data: {
        categoryId: cat.id,
        slug: "prod-slug",
        sortOrder: 1,
        title: { en: "Prod A", vi: "Prod A" },
        tag: { en: "T", vi: "T" },
        desc: { en: "D", vi: "D" },
      },
    });
    await expect(
      prisma.product.create({
        data: {
          categoryId: cat.id,
          slug: "prod-slug", // same (categoryId, slug)
          sortOrder: 2,
          title: { en: "Prod B", vi: "Prod B" },
          tag: { en: "T", vi: "T" },
          desc: { en: "D", vi: "D" },
        },
      }),
    ).rejects.toThrow();
  });

  it("ReleaseStatus has exactly PUBLISHED and ARCHIVED — no DRAFT", () => {
    expect(Object.keys(ReleaseStatus).sort()).toEqual(["ARCHIVED", "PUBLISHED"]);
    expect(ReleaseStatus).not.toHaveProperty("DRAFT");
  });
});

// Global catalog domain (migration 20260702140000_global_catalog_domain). The
// catalog release machinery mirrors the content release machinery, so these
// invariants mirror the content ones above — but on the independent tables.
describeIntegration("global_catalog_domain migration", () => {
  it("defaults the CatalogDraft singleton id to 'singleton' with zeroed revisions", async () => {
    const d = await prisma.catalogDraft.create({ data: { draftSnapshot: {} } });
    expect(d.id).toBe("singleton");
    expect(d.draftRevision).toBe(0);
    expect(d.lastPublishedRevision).toBe(0);
  });

  it("has a monotonic catalog_release_version_seq (independent of release_version_seq)", async () => {
    const a =
      await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('catalog_release_version_seq')`;
    const b =
      await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('catalog_release_version_seq')`;
    expect(Number(b[0].nextval)).toBe(Number(a[0].nextval) + 1);
  });

  it("enforces unique CatalogRelease.version (monotonic-version invariant)", async () => {
    const u = await makeUser();
    await makeCatalogRelease(1, u.id, ReleaseStatus.ARCHIVED);
    await expect(makeCatalogRelease(1, u.id, ReleaseStatus.PUBLISHED)).rejects.toThrow();
  });

  it("enforces the single-CatalogPublishedPointer invariant via @id singleton + releaseId @unique", async () => {
    const u = await makeUser();
    const r2 = await makeCatalogRelease(2, u.id, ReleaseStatus.PUBLISHED);
    const r3 = await makeCatalogRelease(3, u.id, ReleaseStatus.PUBLISHED);
    await prisma.catalogPublishedPointer.create({
      data: { releaseId: r2.id, publishedVersion: 2, publishedById: u.id },
    });
    // A second pointer row collides on the singleton PK -> exactly one LIVE catalog release.
    await expect(
      prisma.catalogPublishedPointer.create({
        data: { releaseId: r3.id, publishedVersion: 3, publishedById: u.id },
      }),
    ).rejects.toThrow();
  });
});
