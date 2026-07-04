/**
 * loginAsEditor — seeds a throw-away EDITOR user, logs in via the real
 * /api/auth/login endpoint, returns the sx_session cookie string.
 *
 * Call ONCE in beforeAll and reuse the cookie — the login route is
 * throttled 5/60 s so repeated logins cause flakiness.
 *
 * The created user is keyed by a unique `e2e`-prefixed username so concurrent
 * test runs do not clash. Callers are responsible for deleting it in afterAll.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { prisma } from '@signex/db';
import { hashPassword } from '../../src/common/crypto/password';

export const E2E_EDITOR_USERNAME = `e2e-editor-${Date.now()}`;
export const E2E_EDITOR_PASSWORD = 'E2eEditorPass123!';

/** Creates the EDITOR user if it does not exist yet, logs in, returns cookie. */
export async function loginAsEditor(app: INestApplication): Promise<string> {
  // Ensure the EDITOR user exists (idempotent).
  await prisma.user.upsert({
    where: { username: E2E_EDITOR_USERNAME },
    create: {
      username: E2E_EDITOR_USERNAME,
      name: 'E2E Editor',
      passwordHash: await hashPassword(E2E_EDITOR_PASSWORD),
      role: 'EDITOR',
      isActive: true,
    },
    update: {},
  });

  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: E2E_EDITOR_USERNAME, password: E2E_EDITOR_PASSWORD })
    .expect(201);

  const setCookieHeader = res.headers['set-cookie'] as string | string[];
  const cookieStr = Array.isArray(setCookieHeader)
    ? setCookieHeader[0]
    : setCookieHeader;

  // Extract just the "sx_session=<value>" part (strip flags like HttpOnly etc.)
  const match = /sx_session=[^;]+/.exec(cookieStr);
  if (!match) throw new Error('sx_session cookie not found in login response');
  return match[0];
}

/**
 * Pattern-based cleanup: deletes ALL test users (username starting with `e2e`)
 * plus every row that FK-references them (Session, AuditLog, Release, etc.).
 *
 * Safe because the only real users are `admin` and `ealflm`, neither of which
 * matches the `e2e`-prefix pattern. Idempotent — deleteMany never throws on
 * zero rows matched, so aborted/re-run test suites never accumulate orphans.
 *
 * FK resolution order (RESTRICT constraints require manual ordering):
 *   PublishedPointer → Release → (Session CASCADE, AuditLog SET NULL) → User
 */
export async function cleanupEditorUser(): Promise<void> {
  const userFilter = { username: { startsWith: 'e2e' } } as const;
  // Release.createdById is RESTRICT — must delete referencing rows first.
  // PublishedPointer.releaseId is RESTRICT — delete those before Release.
  await prisma.publishedPointer.deleteMany({
    where: { release: { createdBy: userFilter } },
  });
  await prisma.release.deleteMany({ where: { createdBy: userFilter } });
  // Session has onDelete: Cascade from User, but explicit delete is cleaner.
  await prisma.session.deleteMany({ where: { user: userFilter } });
  // AuditLog.userId is SET NULL — no FK issue, but clean it up anyway.
  await prisma.auditLog.deleteMany({ where: { user: userFilter } });
  await prisma.user.deleteMany({ where: userFilter });
}
