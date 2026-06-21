import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function build(isPublic: boolean, required: string[] | undefined, user: any) {
  const reflector = {
    getAllAndOverride: jest
      .fn()
      .mockImplementation((key: string) =>
        key === 'sx:isPublic' ? isPublic : required,
      ),
  } as unknown as Reflector;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
  return { guard: new RolesGuard(reflector), ctx };
}

describe('RolesGuard', () => {
  it('allows public routes', () => {
    const { guard, ctx } = build(true, ['ADMIN'], undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when no @Roles is set', () => {
    const { guard, ctx } = build(false, undefined, { role: 'EDITOR' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when the user rank >= required (ADMIN passes PUBLISHER gate)', () => {
    const { guard, ctx } = build(false, ['PUBLISHER'], { role: 'ADMIN' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects when the user rank < required (EDITOR fails PUBLISHER gate)', () => {
    const { guard, ctx } = build(false, ['PUBLISHER'], { role: 'EDITOR' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated user', () => {
    const { guard, ctx } = build(false, ['EDITOR'], undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
