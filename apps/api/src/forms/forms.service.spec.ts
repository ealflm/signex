import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FormsService, UPLOAD_MAX_BYTES } from './forms.service';

// ── Prisma mock ──────────────────────────────────────────────────────────────
function buildPrisma(created: Record<string, unknown> = { id: 'sub_1' }) {
  return {
    client: {
      formSubmission: {
        create: jest.fn().mockResolvedValue(created),
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
});
