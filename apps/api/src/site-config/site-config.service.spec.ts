import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SiteConfigService } from './site-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RevalidationService } from '../revalidation/revalidation.service';

const ACTOR = { id: 'cuser0000000000000000001', role: 'ADMIN' } as any;

async function buildService(deps: {
  prisma: any;
  audit?: { record: jest.Mock };
  revalidation?: { revalidate: jest.Mock };
}): Promise<SiteConfigService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      SiteConfigService,
      { provide: PrismaService, useValue: deps.prisma },
      {
        provide: AuditService,
        useValue: deps.audit ?? { record: jest.fn() },
      },
      {
        provide: RevalidationService,
        useValue:
          deps.revalidation ?? { revalidate: jest.fn().mockResolvedValue({ ok: true }) },
      },
    ],
  }).compile();
  return moduleRef.get(SiteConfigService);
}

// ---------------------------------------------------------------------------
// get — lazy-init
// ---------------------------------------------------------------------------
describe('SiteConfigService.get', () => {
  it('lazy-inits the singleton via upsert and returns ga4Id "" when unset', async () => {
    const prisma = {
      client: {
        siteConfig: {
          upsert: jest.fn().mockResolvedValue({ id: 'singleton', ga4Id: null }),
        },
      },
    };
    const service = await buildService({ prisma });

    const res = await service.get();

    expect(prisma.client.siteConfig.upsert).toHaveBeenCalledWith({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });
    expect(res).toEqual({ ga4Id: '' });
  });

  it('returns the stored ga4Id when present', async () => {
    const prisma = {
      client: {
        siteConfig: {
          upsert: jest
            .fn()
            .mockResolvedValue({ id: 'singleton', ga4Id: 'G-ABC1234XYZ' }),
        },
      },
    };
    const service = await buildService({ prisma });
    expect(await service.get()).toEqual({ ga4Id: 'G-ABC1234XYZ' });
  });
});

// ---------------------------------------------------------------------------
// update — validate + persist + audit + revalidate
// ---------------------------------------------------------------------------
describe('SiteConfigService.update', () => {
  let tx: any;
  let prisma: any;
  let audit: { record: jest.Mock };
  let revalidation: { revalidate: jest.Mock };

  beforeEach(() => {
    tx = {
      siteConfig: { upsert: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    prisma = {
      client: { $transaction: jest.fn(async (fn: any) => fn(tx)) },
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    revalidation = { revalidate: jest.fn().mockResolvedValue({ ok: true }) };
  });

  it('validates, persists the id, audits siteconfig.update, and revalidates', async () => {
    tx.siteConfig.upsert.mockResolvedValue({ id: 'singleton', ga4Id: 'G-ABC1234XYZ' });
    const service = await buildService({ prisma, audit, revalidation });

    const res = await service.update(ACTOR, { ga4Id: 'G-ABC1234XYZ' });

    expect(tx.siteConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'singleton' },
        update: { ga4Id: 'G-ABC1234XYZ' },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: ACTOR.id,
        action: 'siteconfig.update',
        entityType: 'siteConfig',
        entityId: 'singleton',
      }),
    );
    expect(revalidation.revalidate).toHaveBeenCalledWith({});
    expect(res).toEqual({ ga4Id: 'G-ABC1234XYZ' });
  });

  it('stores an empty string as NULL (unset → no analytics)', async () => {
    tx.siteConfig.upsert.mockResolvedValue({ id: 'singleton', ga4Id: null });
    const service = await buildService({ prisma, audit, revalidation });

    const res = await service.update(ACTOR, { ga4Id: '' });

    expect(tx.siteConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { ga4Id: null } }),
    );
    expect(res).toEqual({ ga4Id: '' });
  });

  it('rejects a malformed GA4 id (400) and never persists or revalidates', async () => {
    const service = await buildService({ prisma, audit, revalidation });

    await expect(service.update(ACTOR, { ga4Id: 'UA-12345' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(revalidation.revalidate).not.toHaveBeenCalled();
  });
});
