import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AssetsService } from './assets.service';
import { R2Service } from './r2.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma() {
  return {
    client: {
      asset: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      assetRef: { findMany: jest.fn().mockResolvedValue([]) },
      releaseAssetRef: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    },
  } as unknown as PrismaService;
}

const r2 = {
  presignPut: jest.fn(),
  putObject: jest.fn(),
  headObject: jest.fn(),
  getObjectBytes: jest.fn(),
  publicUrl: jest.fn((k: string) => `https://media.test/${k}`),
} as unknown as R2Service;

const actor = { id: 'cuserxxxxxxxxxxxxxxxxxxxx', role: 'EDITOR' };
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQGuAAAAAElFTkSuQmCC',
  'base64',
);
const pngSha = createHash('sha256').update(pngBytes).digest('hex');

describe('AssetsService.presign', () => {
  let prisma: PrismaService;
  let svc: AssetsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    svc = new AssetsService(prisma, r2);
  });

  it('short-circuits (deduped) when a READY asset with the sha256 exists', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue({
      id: 'a1', status: 'READY', kind: 'IMAGE', sha256: pngSha, r2Key: 'originals/x/y.png',
      mime: 'image/png', bytes: BigInt(pngBytes.length), width: 1, height: 1, originalName: 'y.png',
      altDefault: null, duration: null, posterId: null,
    });
    const res = await svc.presign(actor, {
      mime: 'image/png', bytes: pngBytes.length, sha256: pngSha, originalName: 'y.png',
    });
    expect(res.deduped).toBe(true);
    expect(prisma.client.asset.create).not.toHaveBeenCalled();
    expect(r2.presignPut).not.toHaveBeenCalled();
  });

  it('creates a PENDING asset + returns a presigned PUT when new', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.client.asset.create as jest.Mock).mockResolvedValue({
      id: 'a2', status: 'PENDING', kind: 'IMAGE', sha256: pngSha,
      r2Key: `originals/${pngSha.slice(0, 32)}/y.png`, mime: 'image/png',
      bytes: BigInt(pngBytes.length), width: null, height: null, originalName: 'y.png',
      altDefault: null, duration: null, posterId: null,
    });
    (r2.presignPut as jest.Mock).mockResolvedValue({
      url: 'https://signed/put', headers: { 'Content-Type': 'image/png' }, expiresIn: 300,
    });
    const res = await svc.presign(actor, {
      mime: 'image/png', bytes: pngBytes.length, sha256: pngSha, originalName: 'y.png',
    });
    expect(res.deduped).toBe(false);
    if (!res.deduped) {
      expect(res.assetId).toBe('a2');
      expect(res.r2Key).toBe(`originals/${pngSha.slice(0, 32)}/y.png`);
      expect(res.upload.url).toBe('https://signed/put');
    }
  });
});

describe('AssetsService.confirm', () => {
  let prisma: PrismaService;
  let svc: AssetsService;
  const pending = {
    id: 'a3', status: 'PENDING', kind: 'IMAGE', sha256: pngSha,
    r2Key: `originals/${pngSha.slice(0, 32)}/y.png`, mime: 'image/png',
    bytes: BigInt(pngBytes.length), width: null, height: null, originalName: 'y.png',
    altDefault: null, duration: null, posterId: null,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    svc = new AssetsService(prisma, r2);
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(pending);
    (r2.headObject as jest.Mock).mockResolvedValue({ contentLength: pngBytes.length });
    (r2.getObjectBytes as jest.Mock).mockResolvedValue(pngBytes);
  });

  it('verifies sha256, sets authoritative dims, flips READY', async () => {
    (prisma.client.asset.update as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ ...pending, ...data }),
    );
    const dto = await svc.confirm(actor, 'a3');
    expect(dto.status).toBe('READY');
    expect(dto.width).toBe(1);
    expect(dto.height).toBe(1);
    const updateArg = (prisma.client.asset.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.data.status).toBe('READY');
  });

  it('throws when R2 object is missing', async () => {
    (r2.headObject as jest.Mock).mockResolvedValue(null);
    await expect(svc.confirm(actor, 'a3')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws CHECKSUM_MISMATCH when bytes hash differs from declared sha256', async () => {
    (r2.getObjectBytes as jest.Mock).mockResolvedValue(Buffer.from('tampered'));
    await expect(svc.confirm(actor, 'a3')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('is idempotent on an already-READY asset', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue({ ...pending, status: 'READY', width: 1, height: 1 });
    const dto = await svc.confirm(actor, 'a3');
    expect(dto.status).toBe('READY');
    expect(r2.getObjectBytes).not.toHaveBeenCalled();
  });
});

describe('AssetsService.confirm SVG', () => {
  let prisma: PrismaService;
  let svc: AssetsService;
  const hostile = Buffer.from('<svg><script>alert(1)</script></svg>');
  const svgSha = createHash('sha256').update(hostile).digest('hex');
  const pending = {
    id: 's1', status: 'PENDING', kind: 'SVG', sha256: svgSha,
    r2Key: `originals/${svgSha.slice(0, 32)}/i.svg`, mime: 'image/svg+xml',
    bytes: BigInt(hostile.length), width: null, height: null, originalName: 'i.svg',
    altDefault: null, duration: null, posterId: null,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    svc = new AssetsService(prisma, r2);
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(pending);
    (r2.headObject as jest.Mock).mockResolvedValue({ contentLength: hostile.length });
    (r2.getObjectBytes as jest.Mock).mockResolvedValue(hostile);
    (prisma.client.asset.update as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ ...pending, ...data }),
    );
  });

  it('sanitizes + re-uploads the cleaned SVG, then flips READY', async () => {
    const dto = await svc.confirm(actor, 's1');
    expect(dto.status).toBe('READY');
    expect(r2.putObject).toHaveBeenCalled();
    const put = (r2.putObject as jest.Mock).mock.calls[0][0];
    expect(put.body.toString()).not.toMatch(/script/i);
    expect(put.cacheControl).toBe('public, max-age=31536000, immutable');
  });
});

describe('AssetsService.replace + setAlt + usage', () => {
  let prisma: PrismaService;
  let svc: AssetsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    svc = new AssetsService(prisma, r2);
  });

  it('usage returns working refs + release refs', async () => {
    (prisma.client.assetRef.findMany as jest.Mock).mockResolvedValue([{ id: 'r1', ownerType: 'product', ownerId: 'p1', field: 'image' }]);
    (prisma.client.releaseAssetRef.findMany as jest.Mock).mockResolvedValue([{ releaseId: 'rel1' }]);
    const u = await svc.usage('a1');
    expect(u.working).toHaveLength(1);
    expect(u.releases).toEqual([{ releaseId: 'rel1' }]);
  });

  it('setAlt updates altDefault + audits', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue({ id: 'a1', status: 'READY', kind: 'IMAGE', sha256: 'x', r2Key: 'k', mime: 'image/png', bytes: BigInt(1), width: 1, height: 1, originalName: 'n', altDefault: null, duration: null, posterId: null });
    (prisma.client.asset.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ id: 'a1', status: 'READY', kind: 'IMAGE', sha256: 'x', r2Key: 'k', mime: 'image/png', bytes: BigInt(1), width: 1, height: 1, originalName: 'n', duration: null, posterId: null, ...data }));
    const dto = await svc.setAlt(actor, 'a1', { en: 'logo', vi: 'logo' });
    expect(dto.altDefault).toEqual({ en: 'logo', vi: 'logo' });
    expect(prisma.client.auditLog.create).toHaveBeenCalled();
  });

  it('setAlt throws NotFound for unknown asset', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(svc.setAlt(actor, 'missing', { en: 'a', vi: 'a' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
