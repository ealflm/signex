import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { verifyPassword } from '../common/crypto/password';

function makePrisma(overrides: Record<string, any> = {}) {
  const user = {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    ...overrides.user,
  };
  const session = {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    ...overrides.session,
  };
  return { client: { user, session } } as any;
}

describe('UsersService', () => {
  it('create hashes the password and returns a public user', async () => {
    const prisma = makePrisma({
      user: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'u1', email: data.email, name: data.name,
            passwordHash: data.passwordHash, role: data.role, isActive: true,
          }),
        ),
      },
    });
    const svc = new UsersService(prisma);
    const out = await svc.create({
      email: 'new@b.com', name: 'New', password: 'pw12345', role: 'EDITOR',
    });
    expect(out).toEqual({
      id: 'u1', email: 'new@b.com', name: 'New', role: 'EDITOR', isActive: true,
    });
    const stored = prisma.client.user.create.mock.calls[0][0].data.passwordHash;
    expect(stored).not.toBe('pw12345');
    await expect(verifyPassword('pw12345', stored)).resolves.toBe(true);
  });

  it('create throws Conflict on duplicate email (P2002)', async () => {
    const prisma = makePrisma({
      user: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    });
    await expect(
      new UsersService(prisma).create({
        email: 'dup@b.com', name: 'X', password: 'pw12345', role: 'EDITOR',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('update revokes sessions when role is provided (possible demote) or deactivating', async () => {
    const prisma = makePrisma({
      user: {
        update: jest.fn().mockResolvedValue({
          id: 'u1', email: 'a@b.com', name: 'A', passwordHash: 'h',
          role: 'EDITOR', isActive: true,
        }),
      },
    });
    const svc = new UsersService(prisma);
    await svc.update('u1', { role: 'EDITOR' });
    expect(prisma.client.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('update does NOT revoke sessions for a name-only patch', async () => {
    const prisma = makePrisma({
      user: {
        update: jest.fn().mockResolvedValue({
          id: 'u1', email: 'a@b.com', name: 'A2', passwordHash: 'h',
          role: 'ADMIN', isActive: true,
        }),
      },
    });
    const svc = new UsersService(prisma);
    await svc.update('u1', { name: 'A2' });
    expect(prisma.client.session.updateMany).not.toHaveBeenCalled();
  });

  it('deactivate sets isActive:false and revokes sessions', async () => {
    const prisma = makePrisma({
      user: {
        update: jest.fn().mockResolvedValue({
          id: 'u1', email: 'a@b.com', name: 'A', passwordHash: 'h',
          role: 'EDITOR', isActive: false,
        }),
      },
    });
    const svc = new UsersService(prisma);
    const out = await svc.deactivate('u1');
    expect(out.isActive).toBe(false);
    expect(prisma.client.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' }, data: { isActive: false },
    });
    expect(prisma.client.session.updateMany).toHaveBeenCalled();
  });
});
