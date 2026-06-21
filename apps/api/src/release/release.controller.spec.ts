import { Test } from '@nestjs/testing';
import { ReleaseController } from './release.controller';
import { ReleaseService } from './release.service';
import { RevalidationService } from '../revalidation/revalidation.service';

const ACTOR = { id: 'cuser1', role: 'PUBLISHER' } as any;

describe('ReleaseController', () => {
  let controller: ReleaseController;
  let service: jest.Mocked<Partial<ReleaseService>>;
  let revalidation: { reFire: jest.Mock };

  beforeEach(async () => {
    service = {
      listReleases: jest.fn().mockResolvedValue([{ version: 1 }]),
      getLive: jest.fn().mockResolvedValue({ version: 1 }),
      diff: jest.fn().mockResolvedValue({ dirty: false }),
      getByVersion: jest.fn().mockResolvedValue({ version: 2 }),
      publish: jest
        .fn()
        .mockResolvedValue({ status: 'published', version: 3, releaseId: 'r3' }),
      rollback: jest.fn().mockResolvedValue({ version: 4, releaseId: 'r4' }),
    } as any;
    revalidation = { reFire: jest.fn().mockResolvedValue({ drained: 1 }) };

    const moduleRef = await Test.createTestingModule({
      controllers: [ReleaseController],
      providers: [
        { provide: ReleaseService, useValue: service },
        { provide: RevalidationService, useValue: revalidation },
      ],
    }).compile();
    controller = moduleRef.get(ReleaseController);
  });

  it('GET list/live/diff delegate to the service', async () => {
    expect(await controller.list()).toEqual([{ version: 1 }]);
    expect(await controller.live()).toEqual({ version: 1 });
    expect(await controller.diff()).toEqual({ dirty: false });
  });

  it('GET :version delegates with a parsed numeric version', async () => {
    expect(await controller.byVersion(2)).toEqual({ version: 2 });
    expect(service.getByVersion).toHaveBeenCalledWith(2);
  });

  it('POST publish passes the current user as actor', async () => {
    const res = await controller.publish(ACTOR, {
      expectedRevision: 5,
      note: 'go',
    });
    expect(res).toEqual({ status: 'published', version: 3, releaseId: 'r3' });
    expect(service.publish).toHaveBeenCalledWith(ACTOR, {
      expectedRevision: 5,
      note: 'go',
    });
  });

  it('POST rollback passes the current user as actor', async () => {
    const res = await controller.rollback(ACTOR, {
      toVersion: 2,
      restoreWorkingState: false,
    });
    expect(res).toEqual({ version: 4, releaseId: 'r4' });
    expect(service.rollback).toHaveBeenCalledWith(ACTOR, {
      toVersion: 2,
      restoreWorkingState: false,
    });
  });

  it('POST :version/revalidate re-fires queued revalidations', async () => {
    expect(await controller.revalidate(3)).toEqual({ drained: 1 });
    expect(revalidation.reFire).toHaveBeenCalledTimes(1);
  });
});
