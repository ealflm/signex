/**
 * Content write-path e2e against real Postgres.
 *
 * Proves: revision guard + bump, (kind,key) upsert, 409 STALE_DRAFT on stale
 * expectedRevision, 422 INVALID_BLOCK on bad data, 401 unauthenticated.
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

// ── Block fixture ─────────────────────────────────────────────────────────────
// Use the formConfig block — it has no AssetRef FKs so no Asset rows are needed.
// key "home.formConfig" → last dot-segment "formConfig" → BLOCK_REGISTRY.formConfig
const BLOCK_KIND = 'PAGE';
const BLOCK_KEY = 'home.formConfig';

const lt = (en: string, vi: string) => ({ en, vi });

const validFormConfig = {
  fields: {
    name:      { label: lt('Name', 'Tên'), placeholder: lt('Your name', 'Tên của bạn'), required: false },
    email:     { label: lt('Email', 'Email'), placeholder: lt('you@example.com', 'ban@example.com'), required: false },
    phone:     { label: lt('Phone', 'Điện thoại'), placeholder: lt('+84', '+84'), required: false },
    quantity:  { label: lt('Quantity', 'Số lượng'), placeholder: lt('1', '1'), required: false },
    standard:  { label: lt('Standard', 'Tiêu chuẩn'), placeholder: lt('Select', 'Chọn'), required: false },
    height:    { label: lt('Height (mm)', 'Cao (mm)'), placeholder: lt('100', '100'), required: false },
    width:     { label: lt('Width (mm)', 'Rộng (mm)'), placeholder: lt('100', '100'), required: false },
    thickness: { label: lt('Thickness (mm)', 'Dày (mm)'), placeholder: lt('3', '3'), required: false },
    upload:    { label: lt('Upload', 'Tải lên'), placeholder: lt('Select file', 'Chọn tệp'), required: false },
    message:   { label: lt('Message', 'Tin nhắn'), placeholder: lt('Details…', 'Chi tiết…'), required: false },
  },
  uploadHelp: lt('PDF, PNG, JPG up to 10 MB', 'PDF, PNG, JPG tối đa 10 MB'),
  standardOptions: [
    { value: 'A3', label: lt('A3', 'A3') },
  ],
  submit:  lt('Submit', 'Gửi'),
  success: lt('Sent!', 'Đã gửi!'),
  fail:    lt('Error', 'Lỗi'),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Content write path (e2e)', () => {
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
    // Clean up: remove ALL content blocks this suite could have created.
    // Scoped to exact test keys so we never clobber production data.
    // Idempotent — deleteMany is a no-op when no rows match.
    await prisma.contentBlock.deleteMany({
      where: {
        kind: BLOCK_KIND as 'PAGE',
        key: { in: [BLOCK_KEY, 'home.hero'] },
      },
    });
    // Remove all test users (*.test emails) + their sessions/audit-logs.
    await cleanupEditorUser();
    await app.close();
  });

  // ── 1. RBAC: unauthenticated → 401 ─────────────────────────────────────────
  it('401 when unauthenticated', () =>
    request(app.getHttpServer())
      .put(`/api/content/blocks/${BLOCK_KIND}/${BLOCK_KEY}`)
      .send({ data: validFormConfig, expectedRevision: 0 })
      .expect(401));

  // ── 2. Happy path: 200 + revision bump to 1 ─────────────────────────────────
  it('200 + revision bump on a valid write', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/content/blocks/${BLOCK_KIND}/${BLOCK_KEY}`)
      .set('Cookie', cookie)
      .send({ data: validFormConfig, expectedRevision: 0 })
      .expect(200);

    expect(res.body).toEqual({ revision: 1 });

    // Verify the DB actually persisted the bump.
    const ws = await prisma.workingState.findUnique({ where: { id: 'singleton' } });
    expect(ws?.revision).toBe(1);
  });

  // ── 3. Optimistic lock: stale expectedRevision → 409 STALE_DRAFT ────────────
  it('409 STALE_DRAFT when expectedRevision is stale', () =>
    request(app.getHttpServer())
      .put(`/api/content/blocks/${BLOCK_KIND}/${BLOCK_KEY}`)
      .set('Cookie', cookie)
      .send({ data: validFormConfig, expectedRevision: 0 }) // revision is now 1
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('STALE_DRAFT')));

  // ── 4. Schema guard: invalid data → 422 INVALID_BLOCK ───────────────────────
  it('422 INVALID_BLOCK when data fails the registry schema', () =>
    request(app.getHttpServer())
      .put(`/api/content/blocks/${BLOCK_KIND}/${BLOCK_KEY}`)
      .set('Cookie', cookie)
      .send({ data: { not: 'a formConfig' }, expectedRevision: 1 })
      .expect(422)
      .expect((r) => expect(r.body.code).toBe('INVALID_BLOCK')));
});
