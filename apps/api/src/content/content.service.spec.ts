import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { WorkingStateService } from '../working-state/working-state.service';
import { AuditService } from '../audit/audit.service';
import {
  parseBlock as parseBlockImpl,
  UnknownBlockKeyError,
} from '@signex/shared';

const parseBlock = parseBlockImpl as jest.MockedFunction<typeof parseBlockImpl>;

// Mock the shared registry so the service test is deterministic and offline.
// Spread jest.requireActual so that UnknownBlockKeyError (a real class) is preserved
// for instanceof checks, while parseBlock is replaced with a jest.fn().
jest.mock('@signex/shared', () => ({
  ...jest.requireActual('@signex/shared'),
  parseBlock: jest.fn(),
}));

function buildTx() {
  return {
    contentBlock: { upsert: jest.fn().mockResolvedValue({ id: 'cb_1' }) },
    assetRef: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    workingState: {
      findUnique: jest.fn().mockResolvedValue({ revision: 2 }),
      update: jest.fn().mockResolvedValue({ revision: 3 }),
    },
  } as any;
}

function buildService(tx: any) {
  const prisma = { client: { $transaction: (fn: any) => fn(tx) } } as any;
  // real WorkingStateService + AuditService (their unit tests already cover them)
  return new ContentService(
    prisma,
    new WorkingStateService(prisma),
    new AuditService(),
  );
}

describe('ContentService.updateBlock', () => {
  beforeEach(() => parseBlock.mockReset());

  it('validates, upserts, reconciles refs, bumps revision and audits', async () => {
    parseBlock.mockReturnValue({ image: { assetId: 'a1' } });
    const tx = buildTx();
    const svc = buildService(tx);

    const res = await svc.updateBlock(
      { id: 'user_1' },
      'PAGE' as any,
      'home.hero',
      { any: 1 },
      2,
    );

    expect(res).toEqual({ revision: 3 });
    expect(parseBlock).toHaveBeenCalledWith('PAGE', 'home.hero', { any: 1 });
    expect(tx.contentBlock.upsert).toHaveBeenCalledWith({
      where: { kind_key: { kind: 'PAGE', key: 'home.hero' } },
      create: {
        kind: 'PAGE',
        key: 'home.hero',
        data: { image: { assetId: 'a1' } },
      },
      update: { data: { image: { assetId: 'a1' } } },
    });
    expect(tx.assetRef.deleteMany).toHaveBeenCalledWith({
      where: { ownerType: 'contentBlock', ownerId: 'PAGE:home.hero' },
    });
    expect(tx.assetRef.createMany).toHaveBeenCalledWith({
      data: [
        {
          ownerType: 'contentBlock',
          ownerId: 'PAGE:home.hero',
          field: 'image',
          assetId: 'a1',
          alt: undefined,
        },
      ],
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        action: 'content.update',
        entityType: 'contentBlock',
        entityId: 'PAGE:home.hero',
      }),
    });
  });

  it('throws 422 INVALID_BLOCK when parseBlock throws', async () => {
    parseBlock.mockImplementation(() => {
      const e: any = new Error('bad');
      e.name = 'ZodError';
      e.issues = [{ path: ['image'], message: 'required' }];
      throw e;
    });
    const tx = buildTx();
    const svc = buildService(tx);
    await expect(
      svc.updateBlock({ id: 'u' }, 'PAGE' as any, 'home.hero', {}, 2),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.contentBlock.upsert).not.toHaveBeenCalled();
  });

  it('throws 422 UNKNOWN_BLOCK (4xx) when parseBlock throws UnknownBlockKeyError', async () => {
    parseBlock.mockImplementation(() => {
      throw new UnknownBlockKeyError('seo.home', 'home');
    });
    const tx = buildTx();
    const svc = buildService(tx);
    await expect(
      svc.updateBlock({ id: 'u' }, 'PAGE' as any, 'seo.home', {}, 2),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.contentBlock.upsert).not.toHaveBeenCalled();
  });

  it('throws 409 STALE_DRAFT when the revision moved', async () => {
    parseBlock.mockReturnValue({});
    const tx = buildTx();
    tx.workingState.findUnique.mockResolvedValue({ revision: 5 }); // caller said 2
    const svc = buildService(tx);
    await expect(
      svc.updateBlock({ id: 'u' }, 'PAGE' as any, 'home.hero', {}, 2),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
