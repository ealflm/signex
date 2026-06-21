import { Test } from '@nestjs/testing';
import { SeedService } from './seed.service';
import { SYSTEM_USER_ID, type SeedAdminConfig } from './seed-config';
import { PrismaService } from '../prisma/prisma.service';
import * as password from '../common/crypto/password';

const cfg: SeedAdminConfig = {
  email: 'admin@signex.test',
  name: 'System Admin',
  password: 'change-me-please',
};

describe('SeedService', () => {
  let service: SeedService;
  let upsert: jest.Mock;

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.spyOn(password, 'hashPassword').mockResolvedValue('scrypt$SALT$HASH');
    upsert = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SeedService,
        { provide: PrismaService, useValue: { client: { user: { upsert } } } },
      ],
    }).compile();
    service = moduleRef.get(SeedService);
  });

  it('hashes the password via the shared scrypt hasher (not inline)', async () => {
    upsert.mockResolvedValue({
      id: SYSTEM_USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await service.seedAdmin(cfg);
    expect(password.hashPassword).toHaveBeenCalledWith('change-me-please');
  });

  it('upserts the fixed system user as ADMIN + active with the deterministic id', async () => {
    upsert.mockResolvedValue({
      id: SYSTEM_USER_ID,
      createdAt: new Date('2020-01-01'),
      updatedAt: new Date('2020-01-01'),
    });
    await service.seedAdmin(cfg);
    const args = upsert.mock.calls[0][0];
    expect(args.where).toEqual({ id: SYSTEM_USER_ID });
    expect(args.create).toMatchObject({
      id: SYSTEM_USER_ID,
      email: 'admin@signex.test',
      name: 'System Admin',
      passwordHash: 'scrypt$SALT$HASH',
      role: 'ADMIN',
      isActive: true,
    });
    expect(args.update).toMatchObject({
      email: 'admin@signex.test',
      name: 'System Admin',
      passwordHash: 'scrypt$SALT$HASH',
      role: 'ADMIN',
      isActive: true,
    });
    // never reassigns the id on update
    expect(args.update.id).toBeUndefined();
  });

  it('reports created:true on first run (createdAt === updatedAt)', async () => {
    const t = new Date('2020-01-01T00:00:00.000Z');
    upsert.mockResolvedValue({
      id: SYSTEM_USER_ID,
      createdAt: t,
      updatedAt: t,
    });
    await expect(service.seedAdmin(cfg)).resolves.toEqual({
      id: SYSTEM_USER_ID,
      created: true,
    });
  });

  it('reports created:false on a re-run (updatedAt > createdAt) and is idempotent', async () => {
    upsert.mockResolvedValue({
      id: SYSTEM_USER_ID,
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
      updatedAt: new Date('2020-02-01T00:00:00.000Z'),
    });
    await expect(service.seedAdmin(cfg)).resolves.toEqual({
      id: SYSTEM_USER_ID,
      created: false,
    });
    await expect(service.seedAdmin(cfg)).resolves.toEqual({
      id: SYSTEM_USER_ID,
      created: false,
    });
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});
