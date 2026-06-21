/**
 * Catalog write-path e2e against real Postgres.
 *
 * Proves: createCategory (POST /api/catalog/categories) bumps revision,
 * createProduct (POST /api/catalog/products) bumps revision again,
 * stale expectedRevision → 409 STALE_DRAFT.
 *
 * Uses the REAL AuthService (no stub). Boots the full AppModule.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { prisma } from '@signex/db';
import { AppModule } from '../src/app.module';
import { loginAsEditor, cleanupEditorUser } from './helpers/login';

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Catalog write path (e2e)', () => {
  let app: INestApplication;
  let cookie: string;
  let categoryId: string;

  beforeAll(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();

    // Reset the working-state singleton so revision starts at 0 for this suite.
    await prisma.workingState.upsert({
      where: { id: 'singleton' },
      update: { revision: 0, lastPublishedRevision: 0 },
      create: { id: 'singleton', revision: 0, lastPublishedRevision: 0 },
    });

    // Seed EDITOR + obtain real session cookie (login once, reuse below).
    cookie = await loginAsEditor(app);
  });

  afterAll(async () => {
    // Clean up: delete products first (FK), then the category.
    if (categoryId) {
      await prisma.product.deleteMany({ where: { categoryId } });
    }
    await prisma.category.deleteMany({ where: { slug: 'e2e-pvc' } });
    // Remove the test EDITOR user + their sessions.
    await cleanupEditorUser();
    await app.close();
  });

  // ── 1. Create category → revision 1 ─────────────────────────────────────────
  it('creates a category and bumps revision to 1', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/catalog/categories')
      .set('Cookie', cookie)
      .send({
        input: {
          slug: 'e2e-pvc',
          sortOrder: 0,
          title: { en: 'PVC', vi: 'PVC' },
          tag: { en: 'PVC', vi: 'PVC' },
          intro: { en: 'PVC intro', vi: 'Giới thiệu PVC' },
          productCount: 1,
          materialCount: 1,
        },
        expectedRevision: 0,
      })
      .expect(201);

    expect(res.body.revision).toBe(1);
    categoryId = res.body.id;
    expect(typeof categoryId).toBe('string');
  });

  // ── 2. Create product under it → revision 2 ──────────────────────────────────
  it('creates a product under it and bumps revision to 2', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/catalog/products')
      .set('Cookie', cookie)
      .send({
        input: {
          categoryId,
          slug: 'e2e-mat',
          sortOrder: 0,
          title: { en: 'Mat', vi: 'Tấm' },
          tag: { en: 'mat', vi: 'tấm' },
          desc: { en: 'A mat product', vi: 'Sản phẩm tấm' },
        },
        expectedRevision: 1,
      })
      .expect(201);

    expect(res.body.revision).toBe(2);
  });

  // ── 3. Stale expectedRevision → 409 ──────────────────────────────────────────
  it('409 on a stale concurrent write', () =>
    request(app.getHttpServer())
      .post('/api/catalog/products')
      .set('Cookie', cookie)
      .send({
        input: {
          categoryId,
          slug: 'e2e-dup',
          sortOrder: 1,
          title: { en: 'Dup', vi: 'Trùng' },
          tag: { en: 'dup', vi: 'trùng' },
          desc: { en: 'Dup product', vi: 'Sản phẩm trùng' },
        },
        expectedRevision: 1, // stale — current revision is 2
      })
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('STALE_DRAFT')));
});
