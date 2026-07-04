import { publicUser } from './auth.types';

describe('publicUser', () => {
  it('strips passwordHash and keeps only the public fields', () => {
    const now = new Date();
    const out = publicUser({
      id: 'u1',
      username: 'someuser',
      name: 'Alice',
      passwordHash: 'scrypt$secret',
      role: 'ADMIN',
      isActive: true,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    } as any);
    expect(out).toEqual({
      id: 'u1',
      username: 'someuser',
      name: 'Alice',
      role: 'ADMIN',
      isActive: true,
    });
    expect((out as Record<string, unknown>).passwordHash).toBeUndefined();
  });
});
