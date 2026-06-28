// jest.mock is hoisted before imports — ReleaseSnapshotSchema.parse becomes a
// passthrough so tests can use an arbitrary minimal object as draftSnapshot.
jest.mock('@signex/shared', () => {
  const actual = jest.requireActual('@signex/shared');
  return {
    ...actual,
    ReleaseSnapshotSchema: {
      parse: (v: unknown) => v,
    },
  };
});

import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { ReleaseService } from './release.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { canonicalJson } from './canonical-json';

const ACTOR = { id: 'cuser0000000000000000001', role: 'PUBLISHER' } as any;
const THEME_ID = 'ctheme0000000000000000001';
const DRAFT_REVISION = 7;

/**
 * Minimal object used as theme.draftSnapshot.
 * ReleaseSnapshotSchema.parse is mocked to return the input unchanged, so this
 * doesn't need to satisfy the full Zod schema — it just needs to be a stable
 * value so the computed checksum is deterministic.
 */
const MOCK_SNAPSHOT = {
  schemaVersion: 1,
  blocks: {},
  catalog: { categories: [] },
  assets: {},
};

/** Pre-computed: sha256(canonicalJson(MOCK_SNAPSHOT)) */
const MOCK_CHECKSUM = createHash('sha256')
  .update(canonicalJson(MOCK_SNAPSHOT))
  .digest('hex');

function makeTx() {
  return {
    theme: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: THEME_ID, draftRevision: DRAFT_REVISION }),
      update: jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([{ nextval: 42n }]),
    release: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'crel0000000000000000001', version: 42 }),
    },
    publishedPointer: {
      // Default: no live release yet → in-lock noop branch is skipped.
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    releaseAssetRef: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    // keep workingState stub so rollback tests still compile against same tx shape
    workingState: {
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('ReleaseService.publish', () => {
  let service: ReleaseService;
  let prisma: any;
  let revalidation: { revalidate: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: ReturnType<typeof makeTx>;

  beforeEach(async () => {
    process.env.MEDIA_PUBLIC_BASE = 'https://media.signex.example';
    tx = makeTx();
    prisma = {
      client: {
        $transaction: jest.fn(async (fn: any) => fn(tx)),
        theme: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: THEME_ID,
            draftRevision: DRAFT_REVISION,
            draftSnapshot: MOCK_SNAPSHOT,
          }),
        },
        publishedPointer: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      },
    };
    revalidation = { revalidate: jest.fn().mockResolvedValue({ ok: true }) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReleaseService,
        { provide: PrismaService, useValue: prisma },
        { provide: RevalidationService, useValue: revalidation },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(ReleaseService);
  });

  it('refuses to publish when MEDIA_PUBLIC_BASE is unset', async () => {
    delete process.env.MEDIA_PUBLIC_BASE;
    await expect(
      service.publish(ACTOR, {
        themeId: THEME_ID,
        expectedDraftRevision: DRAFT_REVISION,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.client.theme.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('refuses to publish when MEDIA_PUBLIC_BASE is an r2.dev dev host', async () => {
    process.env.MEDIA_PUBLIC_BASE = 'https://pub-abc.r2.dev';
    await expect(
      service.publish(ACTOR, {
        themeId: THEME_ID,
        expectedDraftRevision: DRAFT_REVISION,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws 409 STALE_DRAFT when expectedDraftRevision != theme.draftRevision', async () => {
    await expect(
      service.publish(ACTOR, {
        themeId: THEME_ID,
        expectedDraftRevision: DRAFT_REVISION - 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  it('gated no-op: same themeId + same checksum → {status:noop}, no tx opened', async () => {
    prisma.client.publishedPointer.findUnique.mockResolvedValue({
      release: { themeId: THEME_ID, checksum: MOCK_CHECKSUM },
    });
    const res = await service.publish(ACTOR, {
      themeId: THEME_ID,
      expectedDraftRevision: DRAFT_REVISION,
    });
    expect(res).toEqual({ status: 'noop' });
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
    expect(revalidation.revalidate).not.toHaveBeenCalled();
  });

  it('does NOT no-op when live themeId differs even if checksum matches (theme switch)', async () => {
    // Different theme published same bytes → must mint a new release from THIS theme.
    prisma.client.publishedPointer.findUnique.mockResolvedValue({
      release: { themeId: 'ctheme-OTHER', checksum: MOCK_CHECKSUM },
    });
    const res = await service.publish(ACTOR, {
      themeId: THEME_ID,
      expectedDraftRevision: DRAFT_REVISION,
    });
    expect(res.status).toBe('published');
    expect(prisma.client.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.release.create).toHaveBeenCalledTimes(1);
    const createArg = tx.release.create.mock.calls[0][0].data;
    expect(createArg.themeId).toBe(THEME_ID);
    expect(revalidation.revalidate).toHaveBeenCalledTimes(1);
  });

  it('publishes: mints Release{themeId,checksum,fromRevision}, repoints PublishedPointer, updates theme live fields, calls revalidate', async () => {
    const res = await service.publish(ACTOR, {
      themeId: THEME_ID,
      expectedDraftRevision: DRAFT_REVISION,
      note: 'launch',
    });

    expect(res).toEqual({
      status: 'published',
      version: 42,
      releaseId: 'crel0000000000000000001',
    });

    // sequence → version
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);

    // demote existing PUBLISHED → ARCHIVED
    expect(tx.release.updateMany).toHaveBeenCalledWith({
      where: { status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    });

    // Release.create carries themeId, checksum, fromRevision
    expect(tx.release.create).toHaveBeenCalledTimes(1);
    const createArg = tx.release.create.mock.calls[0][0].data;
    expect(createArg.version).toBe(42);
    expect(createArg.status).toBe('PUBLISHED');
    expect(createArg.checksum).toBe(MOCK_CHECKSUM);
    expect(createArg.themeId).toBe(THEME_ID);
    expect(createArg.fromRevision).toBe(DRAFT_REVISION);
    expect(createArg.publishedById).toBe(ACTOR.id);
    expect(createArg.note).toBe('launch');

    // PublishedPointer repointed
    expect(tx.publishedPointer.upsert).toHaveBeenCalledTimes(1);

    // MOCK_SNAPSHOT has no asset refs → createMany skipped
    expect(tx.releaseAssetRef.createMany).not.toHaveBeenCalled();

    // theme live fields updated
    expect(tx.theme.update).toHaveBeenCalledWith({
      where: { id: THEME_ID },
      data: expect.objectContaining({
        liveSnapshot: MOCK_SNAPSHOT,
        lastPublishedRevision: DRAFT_REVISION,
        lastPublishedChecksum: MOCK_CHECKSUM,
      }),
    });

    // audit logged
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: ACTOR.id,
        action: 'release.publish',
        entityType: 'release',
        entityId: 'crel0000000000000000001',
      }),
    );

    // revalidation called once after commit
    expect(revalidation.revalidate).toHaveBeenCalledTimes(1);
  });

  it('re-checks theme.draftRevision inside the tx and throws 409 if it moved (TOCTOU)', async () => {
    // Simulate: draft was edited between the outer read and acquiring the lock.
    tx.theme.findUniqueOrThrow.mockResolvedValue({
      id: THEME_ID,
      draftRevision: DRAFT_REVISION + 1,
    });
    await expect(
      service.publish(ACTOR, {
        themeId: THEME_ID,
        expectedDraftRevision: DRAFT_REVISION,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.release.create).not.toHaveBeenCalled();
  });

  it('in-lock noop: returns {status:noop} when sibling already published same theme+checksum inside the tx', async () => {
    // Simulates the race: outer pre-check saw a different pointer (proceeds to
    // open the tx), but by the time we hold the advisory lock the live pointer
    // already carries the same theme+checksum — second concurrent publish no-ops.
    tx.publishedPointer.findUnique.mockResolvedValue({
      release: { themeId: THEME_ID, checksum: MOCK_CHECKSUM },
    });
    const res = await service.publish(ACTOR, {
      themeId: THEME_ID,
      expectedDraftRevision: DRAFT_REVISION,
    });
    expect(res).toEqual({ status: 'noop' });
    expect(prisma.client.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.release.create).not.toHaveBeenCalled();
    expect(revalidation.revalidate).not.toHaveBeenCalled();
  });

  it('revalidates AFTER commit (non-fatal)', async () => {
    await service.publish(ACTOR, {
      themeId: THEME_ID,
      expectedDraftRevision: DRAFT_REVISION,
    });
    expect(revalidation.revalidate).toHaveBeenCalledTimes(1);
    const txOrder = prisma.client.$transaction.mock.invocationCallOrder[0];
    const revalOrder = revalidation.revalidate.mock.invocationCallOrder[0];
    expect(revalOrder).toBeGreaterThan(txOrder);
  });

  it('does not throw if revalidation resolves falsy after a successful commit', async () => {
    revalidation.revalidate.mockResolvedValue({ ok: false });
    const res = await service.publish(ACTOR, {
      themeId: THEME_ID,
      expectedDraftRevision: DRAFT_REVISION,
    });
    expect(res.status).toBe('published');
  });

  it('resolves {status:published} even when revalidation REJECTS (call-site non-fatal guarantee)', async () => {
    revalidation.revalidate.mockRejectedValue(new Error('web down'));
    const res = await service.publish(ACTOR, {
      themeId: THEME_ID,
      expectedDraftRevision: DRAFT_REVISION,
    });
    expect(res).toEqual({
      status: 'published',
      version: 42,
      releaseId: 'crel0000000000000000001',
    });
    expect(tx.release.create).toHaveBeenCalledTimes(1);
  });
});

describe('ReleaseService rollback / live / list', () => {
  let service: ReleaseService;
  let prisma: any;
  let revalidation: { revalidate: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: any;

  beforeEach(async () => {
    process.env.MEDIA_PUBLIC_BASE = 'https://media.signex.example';
    tx = {
      release: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'crel-old',
          version: 3,
          snapshot: {
            schemaVersion: 1,
            blocks: {},
            catalog: { categories: [] },
            assets: {},
          },
          checksum: 'oldsum',
          assetRefs: [{ assetId: 'a1' }, { assetId: 'a2' }],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'crel-new', version: 9 }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ nextval: 9n }]),
      publishedPointer: { upsert: jest.fn().mockResolvedValue({}) },
      releaseAssetRef: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      workingState: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      client: {
        $transaction: jest.fn(async (fn: any) => fn(tx)),
        workingState: {
          findUniqueOrThrow: jest
            .fn()
            .mockResolvedValue({ revision: 7, lastPublishedRevision: 3 }),
        },
        publishedPointer: {
          findUnique: jest.fn().mockResolvedValue({
            release: {
              version: 8,
              checksum: 'livesum',
              publishedAt: new Date('2026-06-21T00:00:00Z'),
            },
          }),
        },
        release: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'crel-new', version: 9 }]),
        },
      },
    };
    revalidation = { revalidate: jest.fn().mockResolvedValue({ ok: true }) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReleaseService,
        { provide: PrismaService, useValue: prisma },
        { provide: RevalidationService, useValue: revalidation },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(ReleaseService);
  });

  it('rollback (repoint-only) mints a new PUBLISHED release copying the target snapshot', async () => {
    const res = await service.rollback(ACTOR, { toVersion: 3 });

    expect(res).toEqual({ version: 9, releaseId: 'crel-new' });
    const createArg = tx.release.create.mock.calls[0][0].data;
    expect(createArg.version).toBe(9);
    expect(createArg.status).toBe('PUBLISHED');
    expect(createArg.checksum).toBe('oldsum');
    expect(createArg.rolledBackFromVersion).toBe(3);
    expect(tx.releaseAssetRef.createMany).toHaveBeenCalledWith({
      data: [
        { releaseId: 'crel-new', assetId: 'a1' },
        { releaseId: 'crel-new', assetId: 'a2' },
      ],
      skipDuplicates: true,
    });
    // repoint-only: working tables NOT touched
    expect(tx.workingState.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'release.rollback' }),
    );
    expect(revalidation.revalidate).toHaveBeenCalledTimes(1);
  });

  it('getLive returns the live release summary', async () => {
    const live = await service.getLive();
    expect(live).toEqual({
      version: 8,
      checksum: 'livesum',
      publishedAt: new Date('2026-06-21T00:00:00Z'),
    });
  });

  it('listReleases returns the release list', async () => {
    expect(await service.listReleases()).toEqual([
      { id: 'crel-new', version: 9 },
    ]);
  });
});
