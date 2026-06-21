import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService, SESSION_TTL_MS } from './auth.service';
import { SESSION_COOKIE } from './guards/origin.guard';
import type { AuthedUser } from './auth.types';

// Minimal mock for express Response
function makeMockRes() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
}

// Minimal mock for express Request
function makeMockReq(cookies: Record<string, string> = {}) {
  return {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest-test' },
    cookies,
  };
}

const MOCK_USER: AuthedUser = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  role: 'EDITOR',
  isActive: true,
};

const RAW_TOKEN = 'raw_token_abc123';
const EXPIRES_AT = new Date(Date.now() + SESSION_TTL_MS);

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const mockAuthService = {
      login: jest.fn(),
      logout: jest.fn(),
      validateSessionToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  describe('POST /auth/login', () => {
    it('should set cookie and return user on valid credentials', async () => {
      authService.login.mockResolvedValueOnce({
        user: MOCK_USER,
        rawToken: RAW_TOKEN,
        expiresAt: EXPIRES_AT,
      });

      const res = makeMockRes();
      const req = makeMockReq();
      const result = await controller.login(
        { email: 'alice@example.com', password: 'password123' },
        req as any,
        res as any,
      );

      // Cookie must be set with correct attrs
      expect(res.cookie).toHaveBeenCalledTimes(1);
      expect(res.cookie).toHaveBeenCalledWith(
        SESSION_COOKIE,
        RAW_TOKEN,
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: SESSION_TTL_MS,
          expires: EXPIRES_AT,
        }),
      );

      // Return public user shape (no passwordHash)
      expect(result).toEqual({ user: MOCK_USER });
      expect((result.user as any).passwordHash).toBeUndefined();
    });

    it('should NOT set cookie on invalid credentials (AuthService throws)', async () => {
      authService.login.mockRejectedValueOnce(
        new UnauthorizedException('Invalid credentials'),
      );

      const res = makeMockRes();
      const req = makeMockReq();

      await expect(
        controller.login(
          { email: 'bad@example.com', password: 'wrong' },
          req as any,
          res as any,
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/logout', () => {
    it('should call logout and clear cookie when session cookie present', async () => {
      authService.logout.mockResolvedValueOnce(undefined);

      const res = makeMockRes();
      const req = makeMockReq({ [SESSION_COOKIE]: RAW_TOKEN });
      const result = await controller.logout(req as any, res as any);

      expect(authService.logout).toHaveBeenCalledWith(RAW_TOKEN);
      expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, {
        path: '/',
      });
      expect(result).toEqual({ ok: true });
    });

    it('should be a no-op (still return ok) when no session cookie present', async () => {
      const res = makeMockRes();
      const req = makeMockReq({}); // no cookie

      const result = await controller.logout(req as any, res as any);

      expect(authService.logout).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, {
        path: '/',
      });
      expect(result).toEqual({ ok: true });
    });
  });

  describe('GET /auth/me', () => {
    it('should return current user when authed', () => {
      const result = controller.me(MOCK_USER);
      expect(result).toEqual({ user: MOCK_USER });
    });

    it('should throw UnauthorizedException when user is undefined', () => {
      expect(() => controller.me(undefined)).toThrow(UnauthorizedException);
    });
  });
});
