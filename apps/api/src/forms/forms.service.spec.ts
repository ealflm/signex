import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FormsService, UPLOAD_MAX_BYTES } from './forms.service';

// ── Prisma mock ──────────────────────────────────────────────────────────────
function buildPrisma(created: Record<string, unknown> = { id: 'sub_1' }) {
  return {
    client: {
      formSubmission: {
        create: jest.fn().mockResolvedValue(created),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue(created),
      },
    },
  } as any;
}

// ── AssetsService mock ───────────────────────────────────────────────────────
function buildAssets(dto: Record<string, unknown> = { id: 'asset_1' }) {
  return { register: jest.fn().mockResolvedValue(dto) } as any;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const validPayload = { name: 'Alice', email: 'alice@example.com' };
const mockFile = (mime = 'image/png'): Express.Multer.File =>
  ({
    buffer: Buffer.from('fake-image-bytes'),
    mimetype: mime,
    originalname: 'test.png',
    size: 100,
  }) as Express.Multer.File;

describe('FormsService', () => {
  describe('submit — happy path (no upload)', () => {
    it('creates FormSubmission with formKey, payload, ip, ua and returns {ok:true}', async () => {
      const prisma = buildPrisma();
      const assets = buildAssets();
      const svc = new FormsService(prisma, assets);

      const result = await svc.submit(
        'contact',
        validPayload,
        null,
        '1.2.3.4',
        'TestAgent/1.0',
      );

      expect(result).toEqual({ ok: true });
      expect(prisma.client.formSubmission.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          formKey: 'contact',
          payload: validPayload,
          uploadAssetId: null,
          ip: '1.2.3.4',
          userAgent: 'TestAgent/1.0',
        }),
      });
      expect(assets.register).not.toHaveBeenCalled();
    });
  });

  describe('submit — with file upload', () => {
    it('calls assets.register and sets uploadAssetId', async () => {
      const prisma = buildPrisma();
      const assets = buildAssets({ id: 'asset_abc' });
      const svc = new FormsService(prisma, assets);
      const file = mockFile('image/jpeg');

      const result = await svc.submit(
        'quote',
        validPayload,
        file,
        '10.0.0.1',
        'Mozilla/5.0',
      );

      expect(result).toEqual({ ok: true });
      expect(assets.register).toHaveBeenCalledWith(
        { id: expect.any(String), role: 'ADMIN' },
        {
          bytes: file.buffer,
          mime: file.mimetype,
          originalName: file.originalname,
        },
      );
      expect(prisma.client.formSubmission.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          formKey: 'quote',
          uploadAssetId: 'asset_abc',
        }),
      });
    });
  });

  describe('submit — invalid formKey', () => {
    it('throws NotFoundException for unknown formKey', async () => {
      const prisma = buildPrisma();
      const assets = buildAssets();
      const svc = new FormsService(prisma, assets);

      await expect(
        svc.submit('newsletter' as any, validPayload, null, null, null),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.client.formSubmission.create).not.toHaveBeenCalled();
    });
  });

  describe('submit — bad upload mime', () => {
    it('throws BadRequestException for disallowed mime type', async () => {
      const prisma = buildPrisma();
      const assets = buildAssets();
      const svc = new FormsService(prisma, assets);
      const file = mockFile('application/exe');

      await expect(
        svc.submit('contact', validPayload, file, null, null),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(assets.register).not.toHaveBeenCalled();
      expect(prisma.client.formSubmission.create).not.toHaveBeenCalled();
    });
  });

  describe('submit — video upload rejected (images only)', () => {
    it('throws BadRequestException for video/mp4', async () => {
      const prisma = buildPrisma();
      const assets = buildAssets();
      const svc = new FormsService(prisma, assets);
      const file = mockFile('video/mp4');

      await expect(
        svc.submit('contact', validPayload, file, null, null),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(assets.register).not.toHaveBeenCalled();
      expect(prisma.client.formSubmission.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for video/webm', async () => {
      const prisma = buildPrisma();
      const assets = buildAssets();
      const svc = new FormsService(prisma, assets);
      const file = mockFile('video/webm');

      await expect(
        svc.submit('quote', validPayload, file, null, null),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(assets.register).not.toHaveBeenCalled();
      expect(prisma.client.formSubmission.create).not.toHaveBeenCalled();
    });
  });

  describe('submit — oversized upload rejected by service cap', () => {
    it('throws BadRequestException when file exceeds UPLOAD_MAX_BYTES', async () => {
      const prisma = buildPrisma();
      const assets = buildAssets();
      const svc = new FormsService(prisma, assets);
      // Build a buffer 1 byte over the cap (the multer interceptor limit is the
      // first line of defence; this test covers the service-layer fallback).
      const bigFile: Express.Multer.File = {
        buffer: Buffer.alloc(UPLOAD_MAX_BYTES + 1),
        mimetype: 'image/png',
        originalname: 'big.png',
        size: UPLOAD_MAX_BYTES + 1,
      } as Express.Multer.File;

      await expect(
        svc.submit('contact', validPayload, bigFile, null, null),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(assets.register).not.toHaveBeenCalled();
      expect(prisma.client.formSubmission.create).not.toHaveBeenCalled();
    });
  });

  describe('submit — XFF first value used as ip', () => {
    it('stores the first (client) value from x-forwarded-for when multiple proxies present', async () => {
      // The controller parses XFF before calling submit; here we verify that
      // whatever ip string arrives is stored verbatim — simulating what the
      // controller hands us after splitting "client, proxy1, proxy2".
      const prisma = buildPrisma();
      const assets = buildAssets();
      const svc = new FormsService(prisma, assets);

      await svc.submit('contact', validPayload, null, '1.2.3.4', 'TestAgent');

      expect(prisma.client.formSubmission.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ip: '1.2.3.4' }),
      });
    });
  });

  // ─── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns { items, total } without raw upload bytes', async () => {
      const row = {
        id: 'sub_1',
        formKey: 'quote',
        status: 'NEW',
        payload: { name: 'Alice', email: 'a@a.com' },
        ip: '1.2.3.4',
        userAgent: 'Test/1.0',
        createdAt: new Date('2024-01-15'),
        uploadAssetId: 'asset_xyz',
      };
      const prisma = buildPrisma();
      prisma.client.formSubmission.findMany.mockResolvedValue([row]);
      prisma.client.formSubmission.count.mockResolvedValue(1);
      const svc = new FormsService(prisma, buildAssets());

      const result = await svc.list();

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      const item = result.items[0];
      // hasUpload should be derived, not raw id
      expect(item.hasUpload).toBe(true);
      expect(item).not.toHaveProperty('uploadAssetId');
      // no internal raw fields
      expect(item.payload).toEqual(row.payload);
    });

    it('applies status filter in the where clause', async () => {
      const prisma = buildPrisma();
      prisma.client.formSubmission.findMany.mockResolvedValue([]);
      prisma.client.formSubmission.count.mockResolvedValue(0);
      const svc = new FormsService(prisma, buildAssets());

      await svc.list({ status: 'READ' });

      expect(prisma.client.formSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'READ' } }),
      );
      expect(prisma.client.formSubmission.count).toHaveBeenCalledWith({
        where: { status: 'READ' },
      });
    });

    it('applies formKey filter', async () => {
      const prisma = buildPrisma();
      prisma.client.formSubmission.findMany.mockResolvedValue([]);
      prisma.client.formSubmission.count.mockResolvedValue(0);
      const svc = new FormsService(prisma, buildAssets());

      await svc.list({ formKey: 'contact' });

      expect(prisma.client.formSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { formKey: 'contact' } }),
      );
    });

    it('caps take at 200', async () => {
      const prisma = buildPrisma();
      prisma.client.formSubmission.findMany.mockResolvedValue([]);
      prisma.client.formSubmission.count.mockResolvedValue(0);
      const svc = new FormsService(prisma, buildAssets());

      await svc.list({ take: 9999 });

      expect(prisma.client.formSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });
  });

  // ─── summary ───────────────────────────────────────────────────────────────

  describe('summary', () => {
    it('returns 90 entries in series (one per day, zero-filled)', async () => {
      const prisma = buildPrisma();
      // count calls: total, new, quote, contact — all return 0
      prisma.client.formSubmission.count.mockResolvedValue(0);
      // findMany for series returns empty → all zeros
      prisma.client.formSubmission.findMany.mockResolvedValue([]);
      const svc = new FormsService(prisma, buildAssets());

      const result = await svc.summary();

      expect(result.series).toHaveLength(90);
      // Every day should have count 0
      expect(result.series.every((s) => s.count === 0)).toBe(true);
      // Dates are in YYYY-MM-DD format
      expect(result.series[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('accumulates recent row into the series by date', async () => {
      const prisma = buildPrisma();
      prisma.client.formSubmission.count
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(3) // new
        .mockResolvedValueOnce(3) // quote
        .mockResolvedValueOnce(2); // contact
      // Simulate 2 submissions today
      const today = new Date();
      today.setUTCHours(10, 0, 0, 0);
      prisma.client.formSubmission.findMany.mockResolvedValue([
        { createdAt: today },
        { createdAt: today },
      ]);
      const svc = new FormsService(prisma, buildAssets());

      const result = await svc.summary();

      expect(result.total).toBe(5);
      expect(result.new).toBe(3);
      expect(result.byKey.quote).toBe(3);
      expect(result.byKey.contact).toBe(2);
      // Today's entry should have count 2
      const todayStr = today.toISOString().slice(0, 10);
      const todayEntry = result.series.find((s) => s.date === todayStr);
      expect(todayEntry?.count).toBe(2);
    });
  });
});
