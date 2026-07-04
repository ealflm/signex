import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { verifyPassword } from '../common/crypto/password';

function makePrisma(overrides: Record<string, any> = {}) {
  const user = {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
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
            id: 'u1',
            username: data.username,
            name: data.name,
            passwordHash: data.passwordHash,
            role: data.role,
            isActive: true,
          }),
        ),
      },
    });
    const svc = new UsersService(prisma);
    const out = await svc.create({
      username: 'newbie',
      name: 'New',
      password: 'pw12345',
      role: 'EDITOR',
    });
    expect(out).toEqual({
      id: 'u1',
      username: 'newbie',
      name: 'New',
      role: 'EDITOR',
      isActive: true,
    });
    const stored = prisma.client.user.create.mock.calls[0][0].data.passwordHash;
    expect(stored).not.toBe('pw12345');
    await expect(verifyPassword('pw12345', stored)).resolves.toBe(true);
  });

  it('create throws Conflict on duplicate username (P2002)', async () => {
    const prisma = makePrisma({
      user: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    });
    const err = await new UsersService(prisma)
      .create({
        username: 'dup',
        name: 'X',
        password: 'pw12345',
        role: 'EDITOR',
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toBe('Username already in use');
  });

  it('update revokes sessions when role is provided (possible demote) or deactivating', async () => {
    const prisma = makePrisma({
      user: {
        update: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@b.com',
          name: 'A',
          passwordHash: 'h',
          role: 'EDITOR',
          isActive: true,
        }),
      },
    });
    const svc = new UsersService(prisma);
    await svc.update('u1', { role: 'EDITOR' }, 'admin2');
    expect(prisma.client.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('update does NOT revoke sessions for a name-only patch', async () => {
    const prisma = makePrisma({
      user: {
        update: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@b.com',
          name: 'A2',
          passwordHash: 'h',
          role: 'ADMIN',
          isActive: true,
        }),
      },
    });
    const svc = new UsersService(prisma);
    await svc.update('u1', { name: 'A2' }, 'admin2');
    expect(prisma.client.session.updateMany).not.toHaveBeenCalled();
  });

  it('deactivate sets isActive:false and revokes sessions', async () => {
    const prisma = makePrisma({
      user: {
        update: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@b.com',
          name: 'A',
          passwordHash: 'h',
          role: 'EDITOR',
          isActive: false,
        }),
      },
    });
    const svc = new UsersService(prisma);
    const out = await svc.deactivate('u1', 'admin2');
    expect(out.isActive).toBe(false);
    expect(prisma.client.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { isActive: false },
    });
    expect(prisma.client.session.updateMany).toHaveBeenCalled();
  });

  it('deactivate REFUSES to deactivate your own account (self-lockout guard)', async () => {
    const prisma = makePrisma();
    const svc = new UsersService(prisma);
    await expect(svc.deactivate('u1', 'u1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    // Guard runs before any write / session revoke.
    expect(prisma.client.user.update).not.toHaveBeenCalled();
    expect(prisma.client.session.updateMany).not.toHaveBeenCalled();
  });

  it('deactivate REFUSES to deactivate the last active admin', async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'u1', role: 'ADMIN', isActive: true }),
        count: jest.fn().mockResolvedValue(1), // only one active admin left
      },
    });
    const svc = new UsersService(prisma);
    await expect(svc.deactivate('u1', 'admin2')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.client.user.update).not.toHaveBeenCalled();
  });

  it('deactivate ALLOWS deactivating an admin when another active admin remains', async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'u1', role: 'ADMIN', isActive: true }),
        count: jest.fn().mockResolvedValue(2), // a second active admin exists
        update: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@b.com',
          name: 'A',
          role: 'ADMIN',
          isActive: false,
        }),
      },
    });
    const svc = new UsersService(prisma);
    const out = await svc.deactivate('u1', 'admin2');
    expect(out.isActive).toBe(false);
    expect(prisma.client.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { isActive: false },
    });
  });

  it('update REFUSES to self-deactivate (isActive:false on your own id)', async () => {
    const prisma = makePrisma();
    const svc = new UsersService(prisma);
    await expect(
      svc.update('u1', { isActive: false }, 'u1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.client.user.update).not.toHaveBeenCalled();
  });

  it('update REFUSES to demote the last active admin', async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'u1', role: 'ADMIN', isActive: true }),
        count: jest.fn().mockResolvedValue(1),
      },
    });
    const svc = new UsersService(prisma);
    await expect(
      svc.update('u1', { role: 'EDITOR' }, 'admin2'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.client.user.update).not.toHaveBeenCalled();
  });

  it('update ALLOWS reactivation (isActive:true) with no guard interference', async () => {
    const prisma = makePrisma({
      user: {
        update: jest.fn().mockResolvedValue({
          id: 'u2',
          email: 'b@b.com',
          name: 'B',
          role: 'EDITOR',
          isActive: true,
        }),
      },
    });
    const svc = new UsersService(prisma);
    const out = await svc.update('u2', { isActive: true }, 'admin1');
    expect(out.isActive).toBe(true);
    expect(prisma.client.user.update).toHaveBeenCalled();
  });

  it('findAll returns users in public shape (no passwordHash) ordered by createdAt asc', async () => {
    const now = new Date('2024-01-01T00:00:00Z');
    const rows = [
      {
        id: 'u1',
        username: 'alice',
        name: 'Alice',
        passwordHash: 'scrypt$secret',
        role: 'ADMIN',
        isActive: true,
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'u2',
        username: 'bob',
        name: 'Bob',
        passwordHash: 'scrypt$other',
        role: 'EDITOR',
        isActive: false,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const prisma = makePrisma({
      user: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
    });
    const svc = new UsersService(prisma);
    const out = await svc.findAll();

    // Should be called with correct orderBy
    expect(prisma.client.user.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
    });

    // Returns 2 users
    expect(out).toHaveLength(2);

    // No passwordHash in any row
    for (const u of out) {
      expect((u as Record<string, unknown>).passwordHash).toBeUndefined();
    }

    // Has the expected public fields including lastLoginAt and createdAt
    expect(out[0]).toEqual({
      id: 'u1',
      username: 'alice',
      name: 'Alice',
      role: 'ADMIN',
      isActive: true,
      lastLoginAt: now,
      createdAt: now,
    });
    expect(out[1]).toEqual({
      id: 'u2',
      username: 'bob',
      name: 'Bob',
      role: 'EDITOR',
      isActive: false,
      lastLoginAt: null,
      createdAt: now,
    });
  });
});
