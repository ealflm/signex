import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { SESSION_COOKIE } from '../src/auth/guards/origin.guard';
import type { AuthedUser } from '../src/auth/auth.types';

const ADMIN: AuthedUser = {
  id: 'u-admin',
  username: 'e2e-auth-admin',
  name: 'Admin',
  role: 'ADMIN',
  isActive: true,
};
const EDITOR: AuthedUser = {
  id: 'u-editor',
  username: 'e2e-auth-editor',
  name: 'Editor',
  role: 'EDITOR',
  isActive: true,
};

// In-memory auth: "admin-tok" -> ADMIN, "editor-tok" -> EDITOR.
const tokenToUser: Record<string, AuthedUser> = {
  'admin-tok': ADMIN,
  'editor-tok': EDITOR,
};

const authStub: Partial<AuthService> = {
  login: jest.fn(async (username: string, password: string) => {
    if (username === 'e2e-auth-admin' && password === 'pw') {
      return {
        user: ADMIN,
        rawToken: 'admin-tok',
        expiresAt: new Date(Date.now() + 60_000),
      };
    }
    throw new UnauthorizedException('Invalid credentials');
  }),
  logout: jest.fn(async () => {}),
  validateSessionToken: jest.fn(
    async (raw: string) => tokenToUser[raw] ?? null,
  ),
};

describe('Auth + RBAC (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue(authStub)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health is public (200)', () =>
    request(app.getHttpServer())
      .get('/api/health')
      .expect(200, { status: 'ok' }));

  it('GET /api/auth/me is 401 without a session', () =>
    request(app.getHttpServer()).get('/api/auth/me').expect(401));

  it('POST /api/auth/login with bad creds is 401', () =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'e2e-auth-admin', password: 'WRONG' })
      .expect(401));

  it('POST /api/auth/login with a malformed body is 422 (ZodValidationPipe)', () =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'e2e-auth-admin' })
      .expect(422));

  it('login sets the sx_session cookie and me returns the user', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/auth/login')
      .send({ username: 'e2e-auth-admin', password: 'pw' })
      .expect(201);
    const setCookie = login.headers['set-cookie'][0] as string;
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain('httponly');

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.username).toBe('e2e-auth-admin');
    expect(me.body.user.passwordHash).toBeUndefined();
  });

  it('POST /api/users requires ADMIN: 401 anon, 403 editor', async () => {
    const server = app.getHttpServer();
    // anon
    await request(server)
      .post('/api/users')
      .send({
        username: 'e2e-new-user',
        name: 'X',
        password: 'pw12345',
        role: 'EDITOR',
      })
      .expect(401);
    // editor -> forbidden by RolesGuard
    await request(server)
      .post('/api/users')
      .set('Cookie', [`${SESSION_COOKIE}=editor-tok`])
      .send({
        username: 'e2e-new-user',
        name: 'X',
        password: 'pw12345',
        role: 'EDITOR',
      })
      .expect(403);
  });
});
