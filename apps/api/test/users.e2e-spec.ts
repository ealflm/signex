import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { prisma } from '@signex/db';
import { hashPassword } from '../src/common/crypto/password';
import type { AuthedUser } from '../src/auth/auth.types';

// In-memory auth: cookie `sx_session=admin-tok` resolves to this ADMIN. The acting
// admin id drives the self-deactivation guard, so it must be stable + known.
const ADMIN: AuthedUser = {
  id: 'u-admin-e2e',
  username: 'e2e-users-admin',
  name: 'Admin',
  role: 'ADMIN',
  isActive: true,
};
const authStub: Partial<AuthService> = {
  validateSessionToken: jest.fn(async (raw: string) =>
    raw === 'admin-tok' ? ADMIN : null,
  ),
};
const ADMIN_COOKIE = 'sx_session=admin-tok';

describe('Users management guards (e2e)', () => {
  let app: INestApplication;
  let targetId: string;
  const TARGET_USERNAME = `e2e-users-target-${Date.now()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue(authStub)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();

    const target = await prisma.user.create({
      data: {
        username: TARGET_USERNAME,
        name: 'Target',
        passwordHash: await hashPassword('irrelevant-1234'),
        role: 'EDITOR',
        isActive: true,
      },
    });
    targetId = target.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({
      where: { user: { username: { startsWith: 'e2e' } } },
    });
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'e2e' } },
    });
    await app.close();
  });

  it('PATCH /:id parses the JSON body and applies a role change (pipe must NOT run on @Param)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/users/${targetId}`)
      .set('Cookie', ADMIN_COOKIE)
      .send({ role: 'PUBLISHER' })
      .expect(200);

    const after = await prisma.user.findUnique({ where: { id: targetId } });
    expect(after?.role).toBe('PUBLISHER');
  });

  it('DELETE /:id refuses self-deactivation with 409', async () => {
    await request(app.getHttpServer())
      .delete(`/api/users/${ADMIN.id}`)
      .set('Cookie', ADMIN_COOKIE)
      .expect(409);
  });

  it('PATCH /:id can reactivate a deactivated user (isActive:true)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/users/${targetId}`)
      .set('Cookie', ADMIN_COOKIE)
      .expect(200);
    const mid = await prisma.user.findUnique({ where: { id: targetId } });
    expect(mid?.isActive).toBe(false);

    await request(app.getHttpServer())
      .patch(`/api/users/${targetId}`)
      .set('Cookie', ADMIN_COOKIE)
      .send({ isActive: true })
      .expect(200);

    const after = await prisma.user.findUnique({ where: { id: targetId } });
    expect(after?.isActive).toBe(true);
  });
});
