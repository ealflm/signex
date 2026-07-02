// jest.mock is hoisted before imports — CatalogSnapshotSchema.parse becomes a
// passthrough so tests can use an arbitrary minimal object as draftSnapshot.
jest.mock('@signex/shared', () => {
  const actual = jest.requireActual('@signex/shared');
  return {
    ...actual,
    CatalogSnapshotSchema: {
      parse: (v: unknown) => v,
    },
  };
});

import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { CatalogReleaseService } from './catalog-release.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { canonicalJson } from '../release/canonical-json';

const ACTOR = { id: 'cuser0000000000000000001', role: 'PUBLISHER' } as any;
const DRAFT_REVISION = 7;

const MOCK_SNAPSHOT = { catalogSchemaVersion: 1, categories: [] };
const MOCK_CHECKSUM = createHash('sha256')
  .update(canonicalJson(MOCK_SNAPSHOT))
  .digest('hex');

function makeTx() {
  return {
    catalogDraft: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'singleton', draftRevision: DRAFT_REVISION }),
      update: jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([{ nextval: 42n }]),
    catalogRelease: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'ccrel000000000000000001', version: 42 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'ctarget',
        version: 5,
        snapshot: MOCK_SNAPSHOT,
        checksum: 'target-checksum',
        assetRefs: [{ assetId: 'casset1' }],
      }),
    },
    catalogPublishedPointer: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    catalogReleaseAssetRef: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('CatalogReleaseService.publish', () => {
  let service: CatalogReleaseService;
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
        catalogDraft: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'singleton',
            draftRevision: DRAFT_REVISION,
            draftSnapshot: MOCK_SNAPSHOT,
          }),
        },
        catalogPublishedPointer: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      },
    };
    revalidation = { revalidate: jest.fn().mockResolvedValue({ ok: true }) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogReleaseService,
        { provide: PrismaService, useValue: prisma },
        { provide: RevalidationService, useValue: revalidation },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(CatalogReleaseService);
  });

  it('refuses to publish when MEDIA_PUBLIC_BASE is unset', async () => {
    delete process.env.MEDIA_PUBLIC_BASE;
    await expect(
      service.publish(ACTOR, { expectedDraftRevision: DRAFT_REVISION }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.client.catalogDraft.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('throws 409 STALE_DRAFT when expectedDraftRevision != draftRevision', async () => {
    await expect(
      service.publish(ACTOR, { expectedDraftRevision: DRAFT_REVISION - 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  it('gated no-op: same checksum → {status:noop}, no tx, no revalidate', async () => {
    prisma.client.catalogPublishedPointer.findUnique.mockResolvedValue({
      release: { checksum: MOCK_CHECKSUM },
    });
    const res = await service.publish(ACTOR, {
      expectedDraftRevision: DRAFT_REVISION,
    });
    expect(res).toEqual({ status: 'noop' });
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
    expect(revalidation.revalidate).not.toHaveBeenCalled();
  });

  it('publishes: mints CatalogRelease, repoints pointer, freezes draft, pins nothing, revalidates catalog tag', async () => {
    const res = await service.publish(ACTOR, {
      expectedDraftRevision: DRAFT_REVISION,
      note: 'launch',
    });
    expect(res.status).toBe('published');
    expect(tx.catalogRelease.updateMany).toHaveBeenCalledWith({
      where: { status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    });
    expect(tx.catalogRelease.create).toHaveBeenCalledTimes(1);
    const createArg = tx.catalogRelease.create.mock.calls[0][0].data;
    expect(createArg.checksum).toBe(MOCK_CHECKSUM);
    expect(createArg.fromRevision).toBe(DRAFT_REVISION);
    expect(tx.catalogPublishedPointer.upsert).toHaveBeenCalledTimes(1);
    // draft bookkeeping frozen clean
    const draftUpdate = tx.catalogDraft.update.mock.calls[0][0].data;
    expect(draftUpdate.lastPublishedRevision).toBe(DRAFT_REVISION);
    expect(draftUpdate.lastPublishedChecksum).toBe(MOCK_CHECKSUM);
    // ONLY the catalog tag is revalidated
    expect(revalidation.revalidate).toHaveBeenCalledWith({ tags: ['catalog'] });
  });

  it('in-lock dedup: sibling published identical checksum while waiting → noop', async () => {
    // pre-tx pointer is null (passes gate) but the in-lock re-read finds a match.
    tx.catalogPublishedPointer.findUnique.mockResolvedValue({
      release: { checksum: MOCK_CHECKSUM },
    });
    const res = await service.publish(ACTOR, {
      expectedDraftRevision: DRAFT_REVISION,
    });
    expect(res).toEqual({ status: 'noop' });
    expect(tx.catalogRelease.create).not.toHaveBeenCalled();
    expect(revalidation.revalidate).not.toHaveBeenCalled();
  });
});

describe('CatalogReleaseService.rollback', () => {
  let service: CatalogReleaseService;
  let prisma: any;
  let revalidation: { revalidate: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: ReturnType<typeof makeTx>;

  beforeEach(async () => {
    process.env.MEDIA_PUBLIC_BASE = 'https://media.signex.example';
    tx = makeTx();
    prisma = { client: { $transaction: jest.fn(async (fn: any) => fn(tx)) } };
    revalidation = { revalidate: jest.fn().mockResolvedValue({ ok: true }) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogReleaseService,
        { provide: PrismaService, useValue: prisma },
        { provide: RevalidationService, useValue: revalidation },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(CatalogReleaseService);
  });

  it('mints a new release from the target snapshot, repoints, pins target assets, revalidates', async () => {
    const res = await service.rollback(ACTOR, { toVersion: 5 });
    expect(res).toEqual({ version: 42, releaseId: 'ccrel000000000000000001' });
    const createArg = tx.catalogRelease.create.mock.calls[0][0].data;
    expect(createArg.rolledBackFromVersion).toBe(5);
    expect(createArg.checksum).toBe('target-checksum');
    expect(tx.catalogReleaseAssetRef.createMany).toHaveBeenCalledTimes(1);
    expect(tx.catalogPublishedPointer.upsert).toHaveBeenCalledTimes(1);
    expect(revalidation.revalidate).toHaveBeenCalledWith({ tags: ['catalog'] });
  });
});
