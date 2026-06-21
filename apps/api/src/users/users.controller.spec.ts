import { UsersController } from './users.controller';

describe('UsersController', () => {
  const now = new Date('2024-01-01T00:00:00Z');

  const mockUsers = [
    {
      id: 'u1',
      email: 'admin@b.com',
      name: 'Alice',
      role: 'ADMIN' as const,
      isActive: true,
      lastLoginAt: now,
      createdAt: now,
    },
    {
      id: 'u2',
      email: 'editor@b.com',
      name: 'Bob',
      role: 'EDITOR' as const,
      isActive: false,
      lastLoginAt: null,
      createdAt: now,
    },
  ];

  const service = {
    findAll: jest.fn().mockResolvedValue(mockUsers),
    create: jest.fn().mockResolvedValue({ id: 'u3' }),
    update: jest.fn().mockResolvedValue({ id: 'u1' }),
    deactivate: jest.fn().mockResolvedValue({ id: 'u1' }),
  } as any;

  const ctrl = new UsersController(service);

  it('GET / delegates to users.findAll() and returns the public-user list', async () => {
    const result = await ctrl.findAll();
    expect(service.findAll).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);

    // No passwordHash in any row
    for (const u of result) {
      expect((u as Record<string, unknown>).passwordHash).toBeUndefined();
    }

    // Has extended fields needed by admin table
    expect(result[0]).toMatchObject({
      id: 'u1',
      email: 'admin@b.com',
      name: 'Alice',
      role: 'ADMIN',
      isActive: true,
      lastLoginAt: now,
      createdAt: now,
    });
    expect(result[1]).toMatchObject({
      id: 'u2',
      email: 'editor@b.com',
      lastLoginAt: null,
    });
  });

  it('POST / delegates to users.create()', async () => {
    const body = {
      email: 'new@b.com',
      name: 'New',
      password: 'pw12345',
      role: 'EDITOR' as const,
    };
    await ctrl.create(body);
    expect(service.create).toHaveBeenCalledWith(body);
  });

  it('PATCH /:id delegates to users.update()', async () => {
    await ctrl.update('u1', { name: 'Updated' });
    expect(service.update).toHaveBeenCalledWith('u1', { name: 'Updated' });
  });

  it('DELETE /:id delegates to users.deactivate()', async () => {
    await ctrl.deactivate('u1');
    expect(service.deactivate).toHaveBeenCalledWith('u1');
  });
});
