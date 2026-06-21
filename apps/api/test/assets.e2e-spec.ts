import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ExecutionContext,
  CanActivate,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { AssetsModule } from '../src/assets/assets.module';
import { R2Service } from '../src/assets/r2.service';
import { R2_CONFIG } from '../src/assets/r2.config';
import { PrismaService } from '../src/prisma/prisma.service';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQGuAAAAAElFTkSuQmCC',
  'base64',
);
const sha = createHash('sha256').update(png).digest('hex');

class PassGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    ctx.switchToHttp().getRequest().user = {
      id: 'ceditorxxxxxxxxxxxxxxxxxx',
      role: 'EDITOR',
    };
    return true;
  }
}

describe('Assets (e2e)', () => {
  let app: INestApplication;
  const store = new Map<string, Buffer>();
  const assetRows = new Map<string, any>();

  const prismaFake = {
    client: {
      asset: {
        findUnique: jest.fn(({ where }: any) => {
          if (where.sha256) {
            for (const a of assetRows.values())
              if (a.sha256 === where.sha256) return Promise.resolve(a);
            return Promise.resolve(null);
          }
          return Promise.resolve(assetRows.get(where.id) ?? null);
        }),
        create: jest.fn(({ data }: any) => {
          const id = `a${assetRows.size + 1}`;
          const row = { id, ...data };
          assetRows.set(id, row);
          return Promise.resolve(row);
        }),
        update: jest.fn(({ where, data }: any) => {
          const row = { ...assetRows.get(where.id), ...data };
          assetRows.set(where.id, row);
          return Promise.resolve(row);
        }),
        findMany: jest.fn(() => Promise.resolve([...assetRows.values()])),
      },
      assetRef: { findMany: jest.fn().mockResolvedValue([]) },
      releaseAssetRef: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    },
  };

  const r2Fake = {
    presignPut: jest.fn().mockResolvedValue({
      url: 'https://signed/put',
      headers: {},
      expiresIn: 300,
    }),
    putObject: jest.fn(({ r2Key, body }: any) => {
      store.set(r2Key, body);
      return Promise.resolve();
    }),
    headObject: jest.fn((k: string) =>
      Promise.resolve(
        store.has(k) ? { contentLength: store.get(k)!.length } : null,
      ),
    ),
    getObjectBytes: jest.fn((k: string) => Promise.resolve(store.get(k)!)),
    publicUrl: jest.fn((k: string) => `https://media.test/${k}`),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AssetsModule],
      providers: [
        { provide: APP_GUARD, useClass: PassGuard },
        { provide: APP_GUARD, useValue: { canActivate: () => true } }, // RolesGuard bypass
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaFake)
      .overrideProvider(R2_CONFIG)
      .useValue({
        endpoint: 'https://fake.r2.test',
        region: 'auto',
        accessKeyId: 'fake-key',
        secretAccessKey: 'fake-secret',
        bucket: 'fake-bucket',
        publicBase: 'https://media.test',
        presignTtlSeconds: 300,
      })
      .overrideProvider(R2Service)
      .useValue(r2Fake)
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/assets/presign creates a PENDING asset + presigned PUT', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/assets/presign')
      .send({
        mime: 'image/png',
        bytes: png.length,
        sha256: sha,
        originalName: 'logo.png',
      })
      .expect(201);
    expect(res.body.deduped).toBe(false);
    expect(res.body.upload.url).toBe('https://signed/put');
    // simulate the browser PUT to R2
    store.set(res.body.r2Key, png);
  });

  it('POST /api/assets/:id/confirm verifies + flips READY', async () => {
    const id = [...assetRows.keys()][0];
    const res = await request(app.getHttpServer())
      .post(`/api/assets/${id}/confirm`)
      .send({})
      .expect(201);
    expect(res.body.status).toBe('READY');
    expect(res.body.width).toBe(1);
  });

  it('presign with the same sha256 short-circuits (deduped)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/assets/presign')
      .send({
        mime: 'image/png',
        bytes: png.length,
        sha256: sha,
        originalName: 'logo.png',
      })
      .expect(201);
    expect(res.body.deduped).toBe(true);
  });

  it('presign rejects a disallowed mime with 422', async () => {
    await request(app.getHttpServer())
      .post('/api/assets/presign')
      .send({
        mime: 'application/zip',
        bytes: 10,
        sha256: sha,
        originalName: 'x.zip',
      })
      .expect(422);
  });

  it('confirm rejects on checksum mismatch with 400', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/assets/presign')
      .send({
        mime: 'image/png',
        bytes: 3,
        sha256: 'c'.repeat(64),
        originalName: 'b.png',
      })
      .expect(201);
    store.set(r.body.r2Key, Buffer.from('xyz')); // bytes whose hash != declared sha
    await request(app.getHttpServer())
      .post(`/api/assets/${r.body.assetId}/confirm`)
      .send({})
      .expect(400);
  });
});
