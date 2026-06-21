import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OriginGuard } from './origin.guard';

function ctx(req: any, isPublic = false) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
  const execCtx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
  return { guard: new OriginGuard(reflector, ['http://admin.test']), execCtx };
}

describe('OriginGuard', () => {
  it('skips public routes', () => {
    const { guard, execCtx } = ctx({ method: 'POST', headers: {} }, true);
    expect(guard.canActivate(execCtx)).toBe(true);
  });

  it('allows safe (GET) methods regardless of origin', () => {
    const { guard, execCtx } = ctx({ method: 'GET', headers: {} });
    expect(guard.canActivate(execCtx)).toBe(true);
  });

  it('allows a POST with no Origin header (server-to-server)', () => {
    const { guard, execCtx } = ctx({ method: 'POST', headers: {} });
    expect(guard.canActivate(execCtx)).toBe(true);
  });

  it('allows a POST from an allowlisted Origin', () => {
    const { guard, execCtx } = ctx({
      method: 'POST',
      headers: { origin: 'http://admin.test' },
    });
    expect(guard.canActivate(execCtx)).toBe(true);
  });

  it('rejects a POST from a foreign Origin', () => {
    const { guard, execCtx } = ctx({
      method: 'POST',
      headers: { origin: 'http://evil.test' },
    });
    expect(() => guard.canActivate(execCtx)).toThrow(ForbiddenException);
  });
});
