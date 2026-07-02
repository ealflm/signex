/**
 * CatalogDraftService unit tests — the global catalog write primitive.
 *
 * PrismaService is mocked so $transaction runs the callback against a tx mock;
 * we verify the optimistic-lock bump, the CatalogSnapshotSchema backstop, and
 * the persist/audit calls without a real database.
 */

import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CatalogDraftService } from './catalog-draft.service';

const ACTOR = { id: 'cuser0000000000000000001', role: 'EDITOR' } as any;

const VALID_CATEGORY = {
  slug: 'new-cat',
  sortOrder: 0,
  title: { en: 'X', vi: 'X' },
  tag: { en: 'T', vi: 'T' },
  intro: { en: 'I', vi: 'I' },
  productCount: 0,
  materialCount: 0,
  items: [],
};

function makeCtx(
  opts: {
    bumpCount?: number;
    existsProbe?: unknown;
    draftSnapshot?: unknown;
    ensureRow?: unknown;
  } = {},
) {
  const tx = {
    catalogDraft: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.bumpCount ?? 1 }),
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.existsProbe === undefined ? { id: 'singleton' } : opts.existsProbe,
        ),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        draftSnapshot: opts.draftSnapshot ?? {
          catalogSchemaVersion: 1,
          categories: [],
        },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const client = {
    catalogDraft: {
      findUnique: jest.fn().mockResolvedValue(
        opts.ensureRow ?? {
          id: 'singleton',
          draftSnapshot: { catalogSchemaVersion: 1, categories: [] },
          draftRevision: 3,
          lastPublishedRevision: 3,
        },
      ),
      create: jest.fn(),
    },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };

  const prisma = { client } as any;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  const svc = new CatalogDraftService(prisma, audit);
  return { svc, tx, client, audit };
}

describe('CatalogDraftService.applyCatalogMutation', () => {
  it('bumps the revision, runs the mutator, persists, and audits', async () => {
    const { svc, tx, audit } = makeCtx();

    const result = await svc.applyCatalogMutation(
      ACTOR,
      3,
      (snap) => {
        snap.categories.push({ ...VALID_CATEGORY });
      },
      { action: 'catalog.category.create' },
    );

    expect(result).toEqual({ draftRevision: 4 });
    expect(tx.catalogDraft.updateMany).toHaveBeenCalledWith({
      where: { id: 'singleton', draftRevision: 3 },
      data: { draftRevision: { increment: 1 } },
    });
    // persisted with the bumped revision + author + the mutated snapshot
    const updateArg = tx.catalogDraft.update.mock.calls[0][0];
    expect(updateArg.data.draftRevision).toBe(4);
    expect(updateArg.data.updatedById).toBe(ACTOR.id);
    expect(updateArg.data.draftSnapshot.categories).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'catalog.category.create',
        entityType: 'catalog',
        entityId: 'singleton',
      }),
    );
  });

  it('throws 409 STALE_DRAFT when the revision guard matches 0 rows (draft still exists)', async () => {
    const { svc, tx } = makeCtx({ bumpCount: 0, existsProbe: { id: 'singleton' } });

    await expect(
      svc.applyCatalogMutation(ACTOR, 99, () => {}, { action: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);

    // never persisted
    expect(tx.catalogDraft.update).not.toHaveBeenCalled();
  });

  it('throws 404 when the singleton is missing at guard time', async () => {
    const { svc } = makeCtx({ bumpCount: 0, existsProbe: null });

    await expect(
      svc.applyCatalogMutation(ACTOR, 0, () => {}, { action: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects with INVALID_SNAPSHOT (422) when the mutator produces a malformed catalog', async () => {
    const { svc, tx } = makeCtx();

    let err: any;
    await svc
      .applyCatalogMutation(
        ACTOR,
        3,
        (snap) => {
          snap.categories.push({ slug: 'broken' }); // missing required FrozenCategory fields
        },
        { action: 'catalog.category.create' },
      )
      .catch((e) => {
        err = e;
      });

    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(err.getResponse()).toMatchObject({ code: 'INVALID_SNAPSHOT' });
    // aborted before persist
    expect(tx.catalogDraft.update).not.toHaveBeenCalled();
  });
});

describe('CatalogDraftService.getDraft', () => {
  it('returns categories + dirty flag from the singleton', async () => {
    const { svc } = makeCtx({
      ensureRow: {
        id: 'singleton',
        draftSnapshot: {
          catalogSchemaVersion: 1,
          categories: [{ slug: 'a' }, { slug: 'b' }],
        },
        draftRevision: 5,
        lastPublishedRevision: 4,
      },
    });

    const view = await svc.getDraft();
    expect(view).toMatchObject({
      draftRevision: 5,
      lastPublishedRevision: 4,
      dirty: true,
    });
    expect(view.categories).toHaveLength(2);
  });
});
