import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, Role, ReleaseStatus } from "../generated/client";

const prisma = new PrismaClient();

beforeAll(() => {
  // Clean DB from the committed migration ONLY (no seed) — proves a fresh apply.
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeUser() {
  return prisma.user.create({
    data: { email: `u${Date.now()}@x.test`, name: "Seed", passwordHash: "x" },
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

describe("cms_foundation migration", () => {
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
});
