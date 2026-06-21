import {
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ReleaseService } from './release.service';
import { SnapshotSerializer } from './snapshot.serializer';
import { RevalidationService } from '../revalidation/revalidation.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const ACTOR = { id: 'cuser0000000000000000001', role: 'PUBLISHER' } as any;

function makeTx() {
  return {
    workingState: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'singleton', revision: 7 }),
      update: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ nextval: 42n }]),
    release: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'crel0000000000000000001', version: 42 }),
    },
    publishedPointer: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    releaseAssetRef: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };
}

describe('ReleaseService.publish', () => {
  let service: ReleaseService;
  let prisma: any;
  let serializer: { serialize: jest.Mock };
  let revalidation: { revalidate: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: ReturnType<typeof makeTx>;

  beforeEach(async () => {
    process.env.MEDIA_PUBLIC_BASE = 'https://media.signex.example';
    tx = makeTx();
    prisma = {
      client: {
        $transaction: jest.fn(async (fn: any) => fn(tx)),
        publishedPointer: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      },
    };
    serializer = {
      serialize: jest.fn().mockResolvedValue({
        snapshot: { schemaVersion: 1, blocks: {}, catalog: { categories: [] } },
        checksum: 'newchecksum',
        assetIds: ['a1', 'a2'],
        fromRevision: 7,
      }),
    };
    revalidation = { revalidate: jest.fn().mockResolvedValue({ ok: true }) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReleaseService,
        { provide: PrismaService, useValue: prisma },
        { provide: SnapshotSerializer, useValue: serializer },
        { provide: RevalidationService, useValue: revalidation },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(ReleaseService);
  });

  it('refuses to publish when MEDIA_PUBLIC_BASE is unset', async () => {
    delete process.env.MEDIA_PUBLIC_BASE;
    await expect(
      service.publish(ACTOR, { expectedRevision: 7 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(serializer.serialize).not.toHaveBeenCalled();
  });

  it('refuses to publish when MEDIA_PUBLIC_BASE is an r2.dev dev host', async () => {
    process.env.MEDIA_PUBLIC_BASE = 'https://pub-abc.r2.dev';
    await expect(
      service.publish(ACTOR, { expectedRevision: 7 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws 409 STALE_DRAFT when expectedRevision != serialized fromRevision', async () => {
    await expect(
      service.publish(ACTOR, { expectedRevision: 6 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  it('soft no-ops when the live checksum equals the new checksum (no version minted)', async () => {
    prisma.client.publishedPointer.findUnique.mockResolvedValue({
      release: { checksum: 'newchecksum' },
    });
    const res = await service.publish(ACTOR, { expectedRevision: 7 });
    expect(res).toEqual({ status: 'noop' });
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
    expect(revalidation.revalidate).not.toHaveBeenCalled();
  });

  it('publishes: sequence version, demote, create, repoint, asset refs, lastPublishedRevision, audit', async () => {
    const res = await service.publish(ACTOR, {
      expectedRevision: 7,
      note: 'launch',
    });

    expect(res).toEqual({
      status: 'published',
      version: 42,
      releaseId: 'crel0000000000000000001',
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.release.updateMany).toHaveBeenCalledWith({
      where: { status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    });
    expect(tx.release.create).toHaveBeenCalledTimes(1);
    const createArg = tx.release.create.mock.calls[0][0].data;
    expect(createArg.version).toBe(42);
    expect(createArg.status).toBe('PUBLISHED');
    expect(createArg.checksum).toBe('newchecksum');
    expect(createArg.fromRevision).toBe(7);
    expect(createArg.publishedById).toBe(ACTOR.id);
    expect(tx.publishedPointer.upsert).toHaveBeenCalledTimes(1);
    expect(tx.releaseAssetRef.createMany).toHaveBeenCalledWith({
      data: [
        { releaseId: 'crel0000000000000000001', assetId: 'a1' },
        { releaseId: 'crel0000000000000000001', assetId: 'a2' },
      ],
      skipDuplicates: true,
    });
    expect(tx.workingState.update).toHaveBeenCalledWith({
      where: { id: 'singleton' },
      data: { lastPublishedRevision: 7 },
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: ACTOR.id,
        action: 'release.publish',
        entityType: 'release',
        entityId: 'crel0000000000000000001',
      }),
    );
  });

  it('re-checks revision inside the tx and throws 409 if it moved (TOCTOU)', async () => {
    tx.workingState.findUniqueOrThrow.mockResolvedValue({
      id: 'singleton',
      revision: 8,
    });
    await expect(
      service.publish(ACTOR, { expectedRevision: 7 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.release.create).not.toHaveBeenCalled();
  });

  it('revalidates AFTER commit (non-fatal)', async () => {
    await service.publish(ACTOR, { expectedRevision: 7 });
    expect(revalidation.revalidate).toHaveBeenCalledTimes(1);
    // revalidate runs after the transaction resolved
    const txOrder = prisma.client.$transaction.mock.invocationCallOrder[0];
    const revalOrder = revalidation.revalidate.mock.invocationCallOrder[0];
    expect(revalOrder).toBeGreaterThan(txOrder);
  });

  it('does not throw if revalidation fails after a successful commit', async () => {
    revalidation.revalidate.mockResolvedValue({ ok: false });
    const res = await service.publish(ACTOR, { expectedRevision: 7 });
    expect(res.status).toBe('published');
  });
});
