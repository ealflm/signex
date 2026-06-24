/**
 * Prisma P2002 → 409 e2e against real Postgres.
 *
 * Proves the global PrismaExceptionFilter maps a unique-constraint violation
 * (duplicate Category.slug) to HTTP 409 Conflict with a clean body — not a 500.
 *
 * Boots the full AppModule (real AuthService + global APP_FILTER).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { prisma } from '@signex/db';
import { AppModule } from '../src/app.module';
import { loginAsEditor, cleanupEditorUser } from './helpers/login';

const SLUG = 'e2e-dup-conflict';

function categoryBody(expectedRevision: number) {
  return {
    input: {
      slug: SLUG,
      sortOrder: 0,
      title: { en: 'Dup', vi: 'Trùng' },
      tag: { en: 'Dup', vi: 'Trùng' },
      intro: { en: 'dup intro', vi: 'gioi thieu' },
      productCount: 1,
      materialCount: 1,
    },
    expectedRevision,
  };
}

describe('Prisma P2002 → 409 (e2e)', () => {
  let app: INestApplication;
  let cookie: string;

  beforeAll(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();

    await prisma.workingState.upsert({
      where: { id: 'singleton' },
      update: { revision: 0, lastPublishedRevision: 0 },
      create: { id: 'singleton', revision: 0, lastPublishedRevision: 0 },
    });

    cookie = await loginAsEditor(app);
  });

  afterAll(async () => {
    await prisma.category.deleteMany({ where: { slug: SLUG } });
    await cleanupEditorUser();
    await app.close();
  });

  it('first insert succeeds (201)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/catalog/categories')
      .set('Cookie', cookie)
      .send(categoryBody(0))
      .expect(201);
    expect(typeof res.body.id).toBe('string');
  });

  it('duplicate slug → 409 Conflict (not 500), clean body, no internal leak', async () => {
    // Use the now-current revision (1) so we pass the STALE_DRAFT guard and the
    // request actually reaches the DB unique-constraint on Category.slug.
    const res = await request(app.getHttpServer())
      .post('/api/catalog/categories')
      .set('Cookie', cookie)
      .send(categoryBody(1))
      .expect(409);

    expect(res.body.code).toBe('CONFLICT');
    expect(typeof res.body.message).toBe('string');
    expect(JSON.stringify(res.body)).not.toMatch(
      /Unique constraint|clientVersion|stack|Prisma/i,
    );
  });
});
