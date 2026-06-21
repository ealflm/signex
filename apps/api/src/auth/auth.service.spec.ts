import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { hashPassword } from '../common/crypto/password';
import { hashToken } from '../common/crypto/token';

function makePrisma(overrides: Record<string, any> = {}) {
  const user = {
    findUnique: jest.fn(),
    ...overrides.user,
  };
  const session = {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    ...overrides.session,
  };
  return { client: { user, session } } as any;
}

describe('AuthService', () => {
  let pwHash: string;
  beforeAll(async () => {
    pwHash = await hashPassword('hunter2');
  });

  it('login returns a user + raw token and stores the hashed token', async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1', email: 'a@b.com', name: 'A', passwordHash: pwHash,
          role: 'ADMIN', isActive: true,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const svc = new AuthService(prisma);
    const res = await svc.login('a@b.com', 'hunter2', { ip: '1.2.3.4' });
    expect(res.user.id).toBe('u1');
    expect(res.user.role).toBe('ADMIN');
    expect((res.user as any).passwordHash).toBeUndefined();
    expect(typeof res.rawToken).toBe('string');
    const arg = prisma.client.session.create.mock.calls[0][0].data;
    expect(arg.tokenHash).toBe(hashToken(res.rawToken));
    expect(arg.userId).toBe('u1');
    expect(arg.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('login throws 401 on wrong password', async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1', email: 'a@b.com', name: 'A', passwordHash: pwHash,
          role: 'ADMIN', isActive: true,
        }),
      },
    });
    const svc = new AuthService(prisma);
    await expect(svc.login('a@b.com', 'WRONG')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('login throws 401 for unknown email and inactive user', async () => {
    const prisma = makePrisma({
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      new AuthService(prisma).login('x@y.com', 'whatever'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const prisma2 = makePrisma({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1', email: 'a@b.com', name: 'A', passwordHash: pwHash,
          role: 'ADMIN', isActive: false,
        }),
      },
    });
    await expect(
      new AuthService(prisma2).login('a@b.com', 'hunter2'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validateSessionToken returns the user for a live session', async () => {
    const future = new Date(Date.now() + 60_000);
    const prisma = makePrisma({
      session: {
        findUnique: jest.fn().mockResolvedValue({
          id: 's1', tokenHash: hashToken('raw'), expiresAt: future,
          revokedAt: null,
          user: { id: 'u1', email: 'a@b.com', name: 'A', passwordHash: 'h',
                  role: 'EDITOR', isActive: true },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const out = await new AuthService(prisma).validateSessionToken('raw');
    expect(out?.id).toBe('u1');
    expect(out?.role).toBe('EDITOR');
  });

  it('validateSessionToken returns null when revoked / expired / inactive / missing', async () => {
    const base = (session: any) =>
      new AuthService(makePrisma({ session: { findUnique: jest.fn().mockResolvedValue(session) } }));
    await expect(base(null).validateSessionToken('raw')).resolves.toBeNull();
    await expect(
      base({ expiresAt: new Date(Date.now() + 1000), revokedAt: new Date(),
             user: { isActive: true } }).validateSessionToken('raw'),
    ).resolves.toBeNull();
    await expect(
      base({ expiresAt: new Date(Date.now() - 1000), revokedAt: null,
             user: { isActive: true } }).validateSessionToken('raw'),
    ).resolves.toBeNull();
    await expect(
      base({ expiresAt: new Date(Date.now() + 1000), revokedAt: null,
             user: { isActive: false } }).validateSessionToken('raw'),
    ).resolves.toBeNull();
  });

  it('logout revokes the matching session by token hash', async () => {
    const prisma = makePrisma();
    await new AuthService(prisma).logout('raw');
    expect(prisma.client.session.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('raw'), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
