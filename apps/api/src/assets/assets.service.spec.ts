import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AssetsService } from './assets.service';
import { assetIdFromSha256 } from './dto/assets.dto';
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
      catalogReleaseAssetRef: { findMany: jest.fn().mockResolvedValue([]) },
      catalogDraft: { findUnique: jest.fn().mockResolvedValue(null) },
      theme: { findMany: jest.fn().mockResolvedValue([]) },
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
      id: 'a1',
      status: 'READY',
      kind: 'IMAGE',
      sha256: pngSha,
      r2Key: 'originals/x/y.png',
      mime: 'image/png',
      bytes: BigInt(pngBytes.length),
      width: 1,
      height: 1,
      originalName: 'y.png',
      altDefault: null,
      duration: null,
      posterId: null,
    });
    const res = await svc.presign(actor, {
      mime: 'image/png',
      bytes: pngBytes.length,
      sha256: pngSha,
      originalName: 'y.png',
    });
    expect(res.deduped).toBe(true);
    expect(prisma.client.asset.create).not.toHaveBeenCalled();
    expect(r2.presignPut).not.toHaveBeenCalled();
  });

  it('creates a PENDING asset + returns a presigned PUT when new', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.client.asset.create as jest.Mock).mockResolvedValue({
      id: 'a2',
      status: 'PENDING',
      kind: 'IMAGE',
      sha256: pngSha,
      r2Key: `originals/${pngSha.slice(0, 32)}/y.png`,
      mime: 'image/png',
      bytes: BigInt(pngBytes.length),
      width: null,
      height: null,
      originalName: 'y.png',
      altDefault: null,
      duration: null,
      posterId: null,
    });
    (r2.presignPut as jest.Mock).mockResolvedValue({
      url: 'https://signed/put',
      headers: { 'Content-Type': 'image/png' },
      expiresIn: 300,
    });
    const res = await svc.presign(actor, {
      mime: 'image/png',
      bytes: pngBytes.length,
      sha256: pngSha,
      originalName: 'y.png',
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
    id: 'a3',
    status: 'PENDING',
    kind: 'IMAGE',
    sha256: pngSha,
    r2Key: `originals/${pngSha.slice(0, 32)}/y.png`,
    mime: 'image/png',
    bytes: BigInt(pngBytes.length),
    width: null,
    height: null,
    originalName: 'y.png',
    altDefault: null,
    duration: null,
    posterId: null,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    svc = new AssetsService(prisma, r2);
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(pending);
    (r2.headObject as jest.Mock).mockResolvedValue({
      contentLength: pngBytes.length,
    });
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
    const updateArg = (prisma.client.asset.update as jest.Mock).mock
      .calls[0][0];
    expect(updateArg.data.status).toBe('READY');
  });

  it('throws when R2 object is missing', async () => {
    (r2.headObject as jest.Mock).mockResolvedValue(null);
    await expect(svc.confirm(actor, 'a3')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws CHECKSUM_MISMATCH when bytes hash differs from declared sha256', async () => {
    (r2.getObjectBytes as jest.Mock).mockResolvedValue(Buffer.from('tampered'));
    await expect(svc.confirm(actor, 'a3')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('is idempotent on an already-READY asset', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue({
      ...pending,
      status: 'READY',
      width: 1,
      height: 1,
    });
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
    id: 's1',
    status: 'PENDING',
    kind: 'SVG',
    sha256: svgSha,
    r2Key: `originals/${svgSha.slice(0, 32)}/i.svg`,
    mime: 'image/svg+xml',
    bytes: BigInt(hostile.length),
    width: null,
    height: null,
    originalName: 'i.svg',
    altDefault: null,
    duration: null,
    posterId: null,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    svc = new AssetsService(prisma, r2);
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(pending);
    (r2.headObject as jest.Mock).mockResolvedValue({
      contentLength: hostile.length,
    });
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

describe('AssetsService.confirm — malformed SVG → 400', () => {
  let prisma: PrismaService;
  let svc: AssetsService;
  const notSvgBytes = Buffer.from('<html>no svg</html>');
  const notSvgSha = createHash('sha256').update(notSvgBytes).digest('hex');
  const pendingSvg = {
    id: 's2',
    status: 'PENDING',
    kind: 'SVG',
    sha256: notSvgSha,
    r2Key: `originals/${notSvgSha.slice(0, 32)}/bad.svg`,
    mime: 'image/svg+xml',
    bytes: BigInt(notSvgBytes.length),
    width: null,
    height: null,
    originalName: 'bad.svg',
    altDefault: null,
    duration: null,
    posterId: null,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    svc = new AssetsService(prisma, r2);
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(pendingSvg);
    (r2.headObject as jest.Mock).mockResolvedValue({
      contentLength: notSvgBytes.length,
    });
    (r2.getObjectBytes as jest.Mock).mockResolvedValue(notSvgBytes);
  });

  it('throws BadRequestException (4xx) for svg+xml bytes with no <svg> root', async () => {
    await expect(svc.confirm(actor, 's2')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('does NOT flip the asset to READY when SVG bytes are malformed', async () => {
    await expect(svc.confirm(actor, 's2')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.client.asset.update).not.toHaveBeenCalled();
  });
});

describe('AssetsService.register — deterministic content-derived ID', () => {
  let prisma: PrismaService;
  let svc: AssetsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    svc = new AssetsService(prisma, r2);
  });

  it('passes id: assetIdFromSha256(sha256) to asset.create (lock deterministic behavior)', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(null);
    const expectedId = assetIdFromSha256(pngSha);
    const createdAsset = {
      id: expectedId,
      status: 'READY',
      kind: 'IMAGE',
      sha256: pngSha,
      r2Key: `originals/${pngSha.slice(0, 32)}/img.png`,
      mime: 'image/png',
      bytes: BigInt(pngBytes.length),
      width: 1,
      height: 1,
      originalName: 'img.png',
      altDefault: null,
      duration: null,
      posterId: null,
    };
    (prisma.client.asset.create as jest.Mock).mockResolvedValue(createdAsset);
    (r2.putObject as jest.Mock).mockResolvedValue(undefined);
    const dto = await svc.register(actor, {
      bytes: pngBytes,
      mime: 'image/png',
      originalName: 'img.png',
    });
    expect(dto.id).toBe(expectedId);
    const createArg = (prisma.client.asset.create as jest.Mock).mock
      .calls[0][0];
    expect(createArg.data.id).toBe(expectedId);
  });
});

describe('AssetsService.register — malformed SVG → 400', () => {
  let prisma: PrismaService;
  let svc: AssetsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    svc = new AssetsService(prisma, r2);
  });

  it('throws BadRequestException when register receives svg+xml bytes with no <svg> root', async () => {
    const notSvgBytes = Buffer.from('<html>no svg</html>');
    await expect(
      svc.register(actor, {
        bytes: notSvgBytes,
        mime: 'image/svg+xml',
        originalName: 'bad.svg',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(r2.putObject).not.toHaveBeenCalled();
  });
});

describe('AssetsService.replace', () => {
  let prisma: PrismaService;
  let svc: AssetsService;
  const existingAsset = {
    id: 'orig1',
    status: 'READY',
    kind: 'IMAGE',
    sha256: 'aabbcc',
    r2Key: 'originals/aabbcc/logo.png',
    mime: 'image/png',
    bytes: BigInt(pngBytes.length),
    width: 1,
    height: 1,
    originalName: 'logo.png',
    altDefault: null,
    duration: null,
    posterId: null,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    svc = new AssetsService(prisma, r2);
  });

  it('delegates to register with new bytes and returns the new asset', async () => {
    (prisma.client.asset.findUnique as jest.Mock)
      .mockResolvedValueOnce(existingAsset) // target lookup
      .mockResolvedValueOnce(null); // dedup check inside register
    const newAsset = {
      id: 'new1',
      status: 'READY',
      kind: 'IMAGE',
      sha256: pngSha,
      r2Key: `originals/${pngSha.slice(0, 32)}/logo.png`,
      mime: 'image/png',
      bytes: BigInt(pngBytes.length),
      width: 1,
      height: 1,
      originalName: 'logo.png',
      altDefault: null,
      duration: null,
      posterId: null,
    };
    (prisma.client.asset.create as jest.Mock).mockResolvedValue(newAsset);
    (r2.putObject as jest.Mock).mockResolvedValue(undefined);
    const dto = await svc.replace(actor, 'orig1', {
      bytes: pngBytes,
      mime: 'image/png',
      originalName: 'logo.png',
    });
    expect(dto.id).toBe('new1');
    expect(dto.status).toBe('READY');
  });

  it('writes an asset.replace audit log with replacedWith', async () => {
    (prisma.client.asset.findUnique as jest.Mock)
      .mockResolvedValueOnce(existingAsset)
      .mockResolvedValueOnce(null);
    const newAsset = {
      id: 'new2',
      status: 'READY',
      kind: 'IMAGE',
      sha256: pngSha,
      r2Key: `originals/${pngSha.slice(0, 32)}/logo.png`,
      mime: 'image/png',
      bytes: BigInt(pngBytes.length),
      width: 1,
      height: 1,
      originalName: 'logo.png',
      altDefault: null,
      duration: null,
      posterId: null,
    };
    (prisma.client.asset.create as jest.Mock).mockResolvedValue(newAsset);
    (r2.putObject as jest.Mock).mockResolvedValue(undefined);
    await svc.replace(actor, 'orig1', {
      bytes: pngBytes,
      mime: 'image/png',
      originalName: 'logo.png',
    });
    const auditCalls = (prisma.client.auditLog.create as jest.Mock).mock.calls;
    const replaceAudit = auditCalls.find(
      (c) => c[0].data.action === 'asset.replace',
    );
    expect(replaceAudit).toBeDefined();
    expect(replaceAudit[0].data.meta).toEqual({ replacedWith: 'new2' });
    expect(replaceAudit[0].data.entityId).toBe('orig1');
  });

  it('throws NotFoundException when the target asset does not exist', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      svc.replace(actor, 'missing', {
        bytes: pngBytes,
        mime: 'image/png',
        originalName: 'logo.png',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequestException when bytes are not provided', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(
      existingAsset,
    );
    await expect(
      svc.replace(actor, 'orig1', {
        mime: 'image/png',
        originalName: 'logo.png',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
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
    (prisma.client.theme.findMany as jest.Mock).mockResolvedValue([
      {
        id: 't1',
        name: 'Theme 1',
        draftSnapshot: { assetId: 'a1' },
        liveSnapshot: null,
      },
    ]);
    (prisma.client.releaseAssetRef.findMany as jest.Mock).mockResolvedValue([
      { releaseId: 'rel1' },
    ]);
    const u = await svc.usage('a1');
    expect(u.working).toHaveLength(1);
    expect(u.releases).toEqual([{ releaseId: 'rel1' }]);
  });

  it('setAlt updates altDefault + audits', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue({
      id: 'a1',
      status: 'READY',
      kind: 'IMAGE',
      sha256: 'x',
      r2Key: 'k',
      mime: 'image/png',
      bytes: BigInt(1),
      width: 1,
      height: 1,
      originalName: 'n',
      altDefault: null,
      duration: null,
      posterId: null,
    });
    (prisma.client.asset.update as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'a1',
        status: 'READY',
        kind: 'IMAGE',
        sha256: 'x',
        r2Key: 'k',
        mime: 'image/png',
        bytes: BigInt(1),
        width: 1,
        height: 1,
        originalName: 'n',
        duration: null,
        posterId: null,
        ...data,
      }),
    );
    const dto = await svc.setAlt(actor, 'a1', { en: 'logo', vi: 'logo' });
    expect(dto.altDefault).toEqual({ en: 'logo', vi: 'logo' });
    expect(prisma.client.auditLog.create).toHaveBeenCalled();
  });

  it('setAlt throws NotFound for unknown asset', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      svc.setAlt(actor, 'missing', { en: 'a', vi: 'a' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AssetsService.softDelete', () => {
  let prisma: PrismaService;
  let svc: AssetsService;

  const readyAsset = {
    id: 'del1',
    status: 'READY',
    kind: 'IMAGE',
    sha256: 'aabbcc',
    r2Key: 'originals/aabbcc/photo.png',
    mime: 'image/png',
    bytes: BigInt(100),
    width: 10,
    height: 10,
    originalName: 'photo.png',
    altDefault: null,
    duration: null,
    posterId: null,
    deletedAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    svc = new AssetsService(prisma, r2);
    // By default: asset exists, nothing references it
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(readyAsset);
    (prisma.client.theme.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.client.releaseAssetRef.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('throws ConflictException(ASSET_IN_USE) when draftSnapshot references the asset', async () => {
    (prisma.client.theme.findMany as jest.Mock).mockResolvedValue([
      {
        id: 't1',
        name: 'Theme 1',
        draftSnapshot: { assetId: 'del1' },
        liveSnapshot: null,
      },
    ]);
    await expect(svc.softDelete(actor, 'del1')).rejects.toMatchObject({
      constructor: ConflictException,
      message: 'ASSET_IN_USE',
    });
  });

  it('throws ConflictException(ASSET_IN_USE) when only liveSnapshot references the asset', async () => {
    (prisma.client.theme.findMany as jest.Mock).mockResolvedValue([
      {
        id: 't2',
        name: 'Theme 2',
        draftSnapshot: {},
        liveSnapshot: { assetId: 'del1' },
      },
    ]);
    await expect(svc.softDelete(actor, 'del1')).rejects.toMatchObject({
      constructor: ConflictException,
      message: 'ASSET_IN_USE',
    });
  });

  it('throws ConflictException(ASSET_IN_USE) when a ReleaseAssetRef references the asset', async () => {
    (prisma.client.releaseAssetRef.findMany as jest.Mock).mockResolvedValue([
      { releaseId: 'rel99' },
    ]);
    await expect(svc.softDelete(actor, 'del1')).rejects.toMatchObject({
      constructor: ConflictException,
      message: 'ASSET_IN_USE',
    });
  });

  it('sets deletedAt, returns dto, and writes audit when nothing references the asset', async () => {
    const now = new Date();
    (prisma.client.asset.update as jest.Mock).mockResolvedValue({
      ...readyAsset,
      deletedAt: now,
    });
    const dto = await svc.softDelete(actor, 'del1');
    const updateArg = (prisma.client.asset.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.data.deletedAt).toBeInstanceOf(Date);
    expect(dto.id).toBe('del1');
    const auditCalls = (prisma.client.auditLog.create as jest.Mock).mock.calls;
    const deleteAudit = auditCalls.find(
      (c: any[]) => c[0].data.action === 'asset.delete',
    );
    expect(deleteAudit).toBeDefined();
    expect(deleteAudit[0].data.entityId).toBe('del1');
  });

  it('throws NotFoundException for a missing asset', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(svc.softDelete(actor, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws NotFoundException for an already-deleted asset', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue({
      ...readyAsset,
      deletedAt: new Date('2024-01-01'),
    });
    await expect(svc.softDelete(actor, 'del1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
