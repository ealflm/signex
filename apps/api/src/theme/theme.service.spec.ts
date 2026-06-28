/**
 * ThemeService unit tests — Tasks 4 + 5.
 *
 * ReleaseSnapshotSchema.safeParse is mocked so the backstop check never
 * rejects a minimal test snapshot; all other @signex/shared exports (parseBlock,
 * BLOCK_REGISTRY, …) are the real implementations.
 */
jest.mock('@signex/shared', () => ({
  ...jest.requireActual('@signex/shared'),
  ReleaseSnapshotSchema: {
    safeParse: jest.fn(() => ({ success: true, data: {} })),
  },
}));

import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@signex/db';
import { ThemeService } from './theme.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const ACTOR = { id: 'cuser0000000000000000001', role: 'EDITOR' } as any;
const THEME_ID = 'ctheme00000000000000001';

const BASE_SNAPSHOT = {
  schemaVersion: 1 as const,
  blocks: {},
  catalog: { categories: [] },
  assets: {},
};

/** Creates a fresh in-memory tx mock for saveDraft tests. */
function makeTx() {
  return {
    theme: {
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
      // guardAndBump's conditional atomic bump: 1 row by default (revision matched).
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({ id: THEME_ID }),
    },
    asset: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

// ---------------------------------------------------------------------------
// guardAndBump
// ---------------------------------------------------------------------------
describe('ThemeService.guardAndBump', () => {
  let service: ThemeService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ThemeService,
        {
          provide: PrismaService,
          useValue: { client: { theme: {}, publishedPointer: {} } },
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ThemeService);
  });

  it('bumps draftRevision via a conditional atomic updateMany and returns the new revision', async () => {
    const tx = makeTx();
    tx.theme.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.guardAndBump(tx as any, THEME_ID, 5);

    expect(result).toBe(6);
    expect(tx.theme.updateMany).toHaveBeenCalledWith({
      where: { id: THEME_ID, draftRevision: 5 },
      data: { draftRevision: { increment: 1 } },
    });
  });

  it('throws ConflictException(STALE_DRAFT) when the conditional bump matches 0 rows but the theme exists', async () => {
    const tx = makeTx();
    tx.theme.updateMany.mockResolvedValue({ count: 0 });
    tx.theme.findUnique.mockResolvedValue({ id: THEME_ID }); // theme still present → 409, not 404

    await expect(
      service.guardAndBump(tx as any, THEME_ID, 5),
    ).rejects.toThrow(ConflictException);
  });

  it('throws NotFoundException when the conditional bump matches 0 rows and the theme is gone', async () => {
    const tx = makeTx();
    tx.theme.updateMany.mockResolvedValue({ count: 0 });
    tx.theme.findUnique.mockResolvedValue(null);

    await expect(
      service.guardAndBump(tx as any, THEME_ID, 5),
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// duplicate
// ---------------------------------------------------------------------------
describe('ThemeService.duplicate', () => {
  let service: ThemeService;
  let prisma: any;

  const sourceSnapshot = {
    ...BASE_SNAPSHOT,
    blocks: { hero: { titleTop: { en: 'Hi', vi: 'Xin chào' } } },
  };

  beforeEach(async () => {
    prisma = {
      client: {
        theme: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: THEME_ID,
            name: 'Default',
            draftSnapshot: sourceSnapshot,
            liveSnapshot: { schemaVersion: 1, blocks: {}, catalog: { categories: [] }, assets: {} },
            draftRevision: 3,
            lastPublishedRevision: 2,
          }),
          create: jest.fn().mockResolvedValue({ id: 'ctheme00000000000000002' }),
        },
        publishedPointer: { findUnique: jest.fn().mockResolvedValue(null) },
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ThemeService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ThemeService);
  });

  it('creates a deep clone with liveSnapshot null and revisions reset to 0', async () => {
    await service.duplicate(ACTOR, THEME_ID, 'Default Copy');

    const data = prisma.client.theme.create.mock.calls[0][0].data;
    expect(data.name).toBe('Default Copy');
    // Json? column set to SQL NULL via Prisma.DbNull (literal null is a type error).
    expect(data.liveSnapshot).toBe(Prisma.DbNull);
    expect(data.draftRevision).toBe(0);
    expect(data.lastPublishedRevision).toBe(0);
    expect(data.createdById).toBe(ACTOR.id);
    // deep clone: must equal source but be a different reference
    expect(data.draftSnapshot).toEqual(sourceSnapshot);
    // ensure it is actually a clone (not the same object)
    expect(data.draftSnapshot).not.toBe(sourceSnapshot);
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------
describe('ThemeService.remove', () => {
  let service: ThemeService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      client: {
        theme: {
          delete: jest.fn().mockResolvedValue({ id: THEME_ID }),
        },
        publishedPointer: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ThemeService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ThemeService);
  });

  it('throws ConflictException(LIVE_THEME) when the theme is the live theme', async () => {
    prisma.client.publishedPointer.findUnique.mockResolvedValue({
      release: { themeId: THEME_ID },
    });

    await expect(service.remove(THEME_ID)).rejects.toThrow(ConflictException);
    expect(prisma.client.theme.delete).not.toHaveBeenCalled();
  });

  it('hard-deletes a theme that is not live', async () => {
    await service.remove(THEME_ID);
    expect(prisma.client.theme.delete).toHaveBeenCalledWith({
      where: { id: THEME_ID },
    });
  });

  it('allows delete when pointer exists but points to a different theme', async () => {
    prisma.client.publishedPointer.findUnique.mockResolvedValue({
      release: { themeId: 'ctheme-other' },
    });
    await service.remove(THEME_ID);
    expect(prisma.client.theme.delete).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------
describe('ThemeService.list', () => {
  let service: ThemeService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      client: {
        theme: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'ctheme-1',
              name: 'Alpha',
              draftRevision: 5,
              lastPublishedRevision: 5,
              updatedAt: new Date('2026-01-01'),
            },
            {
              id: 'ctheme-2',
              name: 'Beta',
              draftRevision: 3,
              lastPublishedRevision: 2,
              updatedAt: new Date('2026-01-02'),
            },
          ]),
        },
        publishedPointer: {
          findUnique: jest.fn().mockResolvedValue({
            release: { themeId: 'ctheme-1' },
          }),
        },
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ThemeService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ThemeService);
  });

  it('derives isLive from PublishedPointer.release.themeId', async () => {
    const list = await service.list();
    const alpha = list.find((t) => t.id === 'ctheme-1')!;
    const beta = list.find((t) => t.id === 'ctheme-2')!;

    expect(alpha.isLive).toBe(true);
    expect(beta.isLive).toBe(false);
  });

  it('resolves heroImageUrl from the draftSnapshot hero image + MEDIA_PUBLIC_BASE', async () => {
    process.env.MEDIA_PUBLIC_BASE = 'https://media.test';
    prisma.client.theme.findMany.mockResolvedValueOnce([
      {
        id: 'ct',
        name: 'X',
        draftRevision: 1,
        lastPublishedRevision: 1,
        updatedAt: new Date('2026-01-01'),
        draftSnapshot: {
          blocks: { hero: { image: { assetId: 'a1' } } },
          assets: { a1: { r2Key: 'originals/x/hero.avif' } },
        },
      },
    ]);
    const list = await service.list();
    expect(list[0].heroImageUrl).toBe('https://media.test/originals/x/hero.avif');
    delete process.env.MEDIA_PUBLIC_BASE;
  });

  it('heroImageUrl is undefined when the theme has no hero image', async () => {
    const list = await service.list();
    expect(list[0].heroImageUrl).toBeUndefined();
  });

  it('derives dirty = draftRevision !== lastPublishedRevision', async () => {
    const list = await service.list();
    const alpha = list.find((t) => t.id === 'ctheme-1')!;
    const beta = list.find((t) => t.id === 'ctheme-2')!;

    expect(alpha.dirty).toBe(false); // 5 === 5
    expect(beta.dirty).toBe(true);   // 3 !== 2
  });

  it('marks all themes as not-live when PublishedPointer is null', async () => {
    prisma.client.publishedPointer.findUnique.mockResolvedValue(null);
    const list = await service.list();
    expect(list.every((t) => !t.isLive)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// saveDraft
// ---------------------------------------------------------------------------
describe('ThemeService.saveDraft', () => {
  let service: ThemeService;
  let prisma: any;
  let audit: { record: jest.Mock };
  let tx: ReturnType<typeof makeTx>;

  beforeEach(async () => {
    tx = makeTx();
    // guardAndBump now bumps via updateMany (count:1 by default in makeTx); the only
    // findUniqueOrThrow left in applyDraftMutation is the snapshot fetch.
    tx.theme.findUniqueOrThrow.mockResolvedValue({
      draftSnapshot: { ...BASE_SNAPSHOT },
    });

    prisma = {
      client: {
        $transaction: jest.fn(async (fn: any) => fn(tx)),
        publishedPointer: { findUnique: jest.fn().mockResolvedValue(null) },
      },
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ThemeService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(ThemeService);
  });

  it('applies an empty edit batch with exactly one draftRevision bump', async () => {
    const result = await service.saveDraft(ACTOR, THEME_ID, {
      edits: [],
      expectedDraftRevision: 5,
    });

    expect(result).toEqual({ draftRevision: 6 });
    // guardAndBump bumps via updateMany (1×); the only theme.update is the final snapshot persist.
    expect(tx.theme.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.theme.update).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: ACTOR.id,
        action: 'theme.savedraft',
        entityType: 'theme',
        entityId: THEME_ID,
      }),
    );
  });

  it('throws ConflictException(STALE_DRAFT) on stale expectedDraftRevision', async () => {
    // Override: the conditional bump matches 0 rows (revision moved on) but the theme exists.
    tx.theme.updateMany.mockResolvedValue({ count: 0 });
    tx.theme.findUnique.mockResolvedValue({ id: THEME_ID });

    await expect(
      service.saveDraft(ACTOR, THEME_ID, {
        edits: [],
        expectedDraftRevision: 5,
      }),
    ).rejects.toThrow(ConflictException);

    // The final snapshot update must NOT have been called
    expect(tx.theme.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('throws UnprocessableEntityException(INVALID_BLOCK) on invalid block data and aborts', async () => {
    // hero block requires titleTop, titleBottom, subtitle, image — sending junk fails
    await expect(
      service.saveDraft(ACTOR, THEME_ID, {
        edits: [{ key: 'hero', data: { notValid: true } }],
        expectedDraftRevision: 5,
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    // Final snapshot update must NOT have been called (aborted mid-tx)
    // (guardAndBump's updateMany bump ran but rolls back in a real DB tx)
    const finalUpdateCalls = tx.theme.update.mock.calls.filter(
      ([arg]: [any]) => arg?.data?.draftSnapshot !== undefined,
    );
    expect(finalUpdateCalls).toHaveLength(0);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('throws UnprocessableEntityException(UNKNOWN_BLOCK) on an unknown key', async () => {
    await expect(
      service.saveDraft(ACTOR, THEME_ID, {
        edits: [{ key: 'nonExistentBlock', data: {} }],
        expectedDraftRevision: 5,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rebuilds snap.assets from asset ids collected from the snapshot', async () => {
    // Snapshot has an old orphan asset; after reconcile it should be replaced
    // by only what asset.findMany returns
    tx.theme.findUniqueOrThrow.mockReset();
    tx.theme.findUniqueOrThrow.mockResolvedValue({
      draftSnapshot: {
        ...BASE_SNAPSHOT,
        assets: {
          'orphan-id': { assetId: 'orphan-id', r2Key: 'orphan.jpg', mime: 'image/jpeg', variants: [] },
        },
      },
    });

    tx.asset.findMany.mockResolvedValue([
      { id: 'new-asset', r2Key: 'new.jpg', mime: 'image/jpeg', width: 800, height: 600, poster: null },
    ]);

    await service.saveDraft(ACTOR, THEME_ID, {
      edits: [],
      expectedDraftRevision: 5,
    });

    // snap.assets passed to the final update should contain 'new-asset' (from findMany)
    // and must NOT contain 'orphan-id' (orphan pruned)
    const finalUpdate = tx.theme.update.mock.calls.find(
      ([arg]: [any]) => arg?.data?.draftSnapshot !== undefined,
    );
    expect(finalUpdate).toBeDefined();
    const updatedSnap = finalUpdate[0].data.draftSnapshot;
    expect(updatedSnap.assets).toHaveProperty('new-asset');
    expect(updatedSnap.assets).not.toHaveProperty('orphan-id');
  });
});
