import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionAuthGuard } from './session-auth.guard';
import { SESSION_COOKIE } from './origin.guard';

function build(isPublic: boolean, validated: any) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as unknown as Reflector;
  const authService = { validateSessionToken: jest.fn().mockResolvedValue(validated) } as any;
  const guard = new SessionAuthGuard(reflector, authService);
  return { guard, authService };
}

function ctxFor(req: any) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe('SessionAuthGuard', () => {
  it('skips public routes (and does not call the service)', async () => {
    const { guard, authService } = build(true, null);
    await expect(guard.canActivate(ctxFor({ cookies: {}, headers: {} }))).resolves.toBe(true);
    expect(authService.validateSessionToken).not.toHaveBeenCalled();
  });

  it('attaches req.user for a valid cookie session', async () => {
    const user = { id: 'u1', role: 'ADMIN' };
    const { guard } = build(false, user);
    const req: any = { cookies: { [SESSION_COOKIE]: 'raw' }, headers: {} };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.user).toBe(user);
  });

  it('reads a Bearer token when no cookie is present (admin server-to-server)', async () => {
    const user = { id: 'u1', role: 'EDITOR' };
    const { guard, authService } = build(false, user);
    const req: any = { cookies: {}, headers: { authorization: 'Bearer raw-tok' } };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(authService.validateSessionToken).toHaveBeenCalledWith('raw-tok');
    expect(req.user).toBe(user);
  });

  it('throws 401 when no token', async () => {
    const { guard } = build(false, null);
    await expect(
      guard.canActivate(ctxFor({ cookies: {}, headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws 401 when the token is invalid', async () => {
    const { guard } = build(false, null);
    await expect(
      guard.canActivate(ctxFor({ cookies: { [SESSION_COOKIE]: 'bad' }, headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
