import { ConflictException } from '@nestjs/common';
import { WorkingStateService } from './working-state.service';

function mockTx(current: { revision: number; lastPublishedRevision: number } | null) {
  return {
    workingState: {
      findUnique: jest.fn().mockResolvedValue(current),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ revision: current!.revision + 1, ...data }),
      ),
      upsert: jest.fn().mockResolvedValue({ revision: 0, lastPublishedRevision: 0 }),
    },
  } as any;
}

describe('WorkingStateService', () => {
  describe('guardAndBump', () => {
    it('bumps and returns revision+1 when expectedRevision matches', async () => {
      const svc = new WorkingStateService({ client: {} } as any);
      const tx = mockTx({ revision: 4, lastPublishedRevision: 0 });
      const next = await svc.guardAndBump(tx, 4, 'user_1');
      expect(next).toBe(5);
      expect(tx.workingState.update).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        data: { revision: 5, updatedById: 'user_1' },
      });
    });

    it('throws 409 STALE_DRAFT when expectedRevision is stale', async () => {
      const svc = new WorkingStateService({ client: {} } as any);
      const tx = mockTx({ revision: 7, lastPublishedRevision: 0 });
      await expect(svc.guardAndBump(tx, 4)).rejects.toBeInstanceOf(ConflictException);
      await expect(svc.guardAndBump(tx, 4)).rejects.toMatchObject({
        response: { code: 'STALE_DRAFT' },
      });
      expect(tx.workingState.update).not.toHaveBeenCalled();
    });

    it('throws 409 when the singleton row is missing', async () => {
      const svc = new WorkingStateService({ client: {} } as any);
      const tx = mockTx(null);
      await expect(svc.guardAndBump(tx, 0)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('ensure', () => {
    it('upserts the singleton with id "singleton"', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      const svc = new WorkingStateService({ client: { workingState: { upsert } } } as any);
      await svc.ensure();
      expect(upsert).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        update: {},
        create: { id: 'singleton', revision: 0, lastPublishedRevision: 0 },
      });
    });
  });
});
