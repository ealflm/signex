import { ImporterService } from './importer.service';

// ---------------------------------------------------------------------------
// Stubs for heavy importer helpers — not under test here (unit level)
// ---------------------------------------------------------------------------
const BLOCK_KEYS = [
  'hero',
  'features',
  'about',
  'productsHeader',
  'footer',
  'nav',
  'meta',
  'businessContact',
  'formConfig',
  'aboutPage',
  'contactPage',
  'notFound',
];

jest.mock('./dict-source', () => ({
  loadDicts: jest.fn(() => ({ en: {}, vi: {} })),
  resolveRepoRoot: jest.fn(() => '/tmp/repo'),
}));
jest.mock('./parity', () => ({ assertParity: jest.fn() }));
jest.mock('./asset-importer', () => ({
  importAssets: jest.fn(async () => new Map()),
}));
jest.mock('./catalog-builder', () => ({
  // One category with one product, both carrying an imageId resolvable below.
  buildCatalog: jest.fn(() => ({
    categories: [
      {
        slug: 'cat-a',
        sortOrder: 0,
        title: { en: 'A', vi: 'A' },
        tag: { en: 't', vi: 't' },
        intro: { en: 'i', vi: 'i' },
        productCount: 1,
        materialCount: 1,
        imageId: 'asset-cat',
        items: [
          {
            slug: 'prod-a',
            sortOrder: 0,
            title: { en: 'P', vi: 'P' },
            tag: { en: 't', vi: 't' },
            desc: { en: 'd', vi: 'd' },
            imageId: 'asset-prod',
          },
        ],
      },
    ],
  })),
}));
jest.mock('./block-builder', () => ({
  // 12 registry-keyed blocks; data carries no asset refs (irrelevant here).
  buildBlocks: jest.fn(() =>
    BLOCK_KEYS.map((key) => ({ kind: 'PAGE', key, data: { stub: key } })),
  ),
}));
jest.mock('./snapshot-emit', () => ({
  emitInitialSnapshot: jest.fn(() => '// generated'),
}));
// Stub shared schema parse so tests don't need a full valid ReleaseSnapshot fixture.
jest.mock('@signex/shared', () => ({
  ...jest.requireActual('@signex/shared'),
  ReleaseSnapshotSchema: {
    parse: jest.fn((v: unknown) => v),
  },
}));

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
function makeDeps() {
  const prisma = {
    $queryRawUnsafe: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) {
        return Promise.resolve([{ pg_try_advisory_lock: true }]);
      }
      return Promise.resolve([{ pg_advisory_unlock: true }]);
    }),
    user: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'sys', email: 'a@b.c', role: 'ADMIN' }),
    },
    theme: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(async ({ data }: any) => ({ id: 'theme-1', ...data })),
    },
    asset: {
      findMany: jest.fn(async () => [
        {
          id: 'asset-cat',
          r2Key: 'k/cat',
          mime: 'image/png',
          width: 100,
          height: 100,
          poster: null,
        },
        {
          id: 'asset-prod',
          r2Key: 'k/prod',
          mime: 'image/png',
          width: 100,
          height: 100,
          poster: null,
        },
      ]),
    },
    release: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'r1',
        snapshot: { schemaVersion: 1, blocks: {}, catalog: { categories: [] }, assets: {} },
      }),
    },
  };

  const assets = {
    register: jest.fn(async () => ({
      id: 'asset-1',
      status: 'READY',
      kind: 'IMAGE',
      sha256: 'abc123',
      r2Key: 'k/abc123',
      url: 'https://cdn.example.com/k/abc123',
      mime: 'image/png',
      bytes: 1024,
      width: 100,
      height: 100,
      duration: null,
      originalName: 'test.png',
      altDefault: null,
      posterId: null,
    })),
  };

  const release = {
    publish: jest.fn(async () => ({
      status: 'published' as const,
      version: 1,
      releaseId: 'r1',
    })),
  };

  return { prisma, assets, release };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ImporterService', () => {
  beforeEach(() => {
    process.env.SEED_ADMIN_EMAIL = 'admin@test.com';
    process.env.MEDIA_PUBLIC_BASE = 'https://cdn.signex.vn';
  });
  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.SEED_ADMIN_EMAIL;
    delete process.env.MEDIA_PUBLIC_BASE;
  });

  it('mints one Default theme + Release v1: assembles a 12-block snapshot with minted catalog ids + assets map', async () => {
    const { prisma, assets, release } = makeDeps();
    const svc = new ImporterService(
      { client: prisma } as any,
      assets as any,
      release as any,
    );
    jest
      .spyOn(svc as any, 'emitSnapshot')
      .mockReturnValue('/tmp/initial-snapshot.ts');

    const res = await svc.run();

    // Advisory lock was attempted.
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('pg_try_advisory_lock'),
    );

    // Exactly one Default theme created.
    expect(prisma.theme.create).toHaveBeenCalledTimes(1);
    const data = prisma.theme.create.mock.calls[0][0].data;
    expect(data.name).toBe('Default');
    expect(data.draftRevision).toBe(1);
    expect(data.lastPublishedRevision).toBe(1);
    expect(typeof data.lastPublishedChecksum).toBe('string');
    expect(data.createdById).toBe('sys');
    // draft == live snapshot.
    expect(data.draftSnapshot).toBe(data.liveSnapshot);

    // Assembled snapshot shape.
    const snap = data.draftSnapshot;
    expect(Object.keys(snap.blocks).sort()).toEqual([...BLOCK_KEYS].sort());
    expect(snap.catalog.categories).toHaveLength(1);
    const cat = snap.catalog.categories[0];
    expect(typeof cat.id).toBe('string');
    expect(cat.id.startsWith('c')).toBe(true);
    expect(cat.image).toBeDefined();
    expect(cat.items[0].id).not.toBe(cat.id);
    expect(cat.items[0].image).toBeDefined();
    // assets map keyed by assetId.
    expect(snap.assets).toHaveProperty('asset-cat');
    expect(snap.assets).toHaveProperty('asset-prod');

    // Release published exactly once with the new themeId/expectedDraftRevision shape.
    expect(release.publish).toHaveBeenCalledTimes(1);
    const [actor, args] = release.publish.mock.calls[0];
    expect(actor.id).toBe('sys');
    expect(args).toEqual({
      themeId: 'theme-1',
      expectedDraftRevision: 1,
      note: 'Initial content import (v1)',
    });

    // Snapshot read back from the Release row, then emitted.
    expect(prisma.release.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'r1' },
    });
    expect(res.version).toBe(1);
    expect(res.releaseId).toBe('r1');
    expect(typeof res.snapshotPath).toBe('string');
  });

  it('refuses to run when advisory lock is not acquired (another import running)', async () => {
    const { prisma, assets, release } = makeDeps();
    prisma.$queryRawUnsafe = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) {
        return Promise.resolve([{ pg_try_advisory_lock: false }]);
      }
      return Promise.resolve([{ pg_advisory_unlock: true }]);
    });
    const svc = new ImporterService(
      { client: prisma } as any,
      assets as any,
      release as any,
    );
    await expect(svc.run()).rejects.toThrow(/already running|lock/i);
    expect(prisma.theme.create).not.toHaveBeenCalled();
    expect(release.publish).not.toHaveBeenCalled();
  });

  it('refuses to run when a Theme already exists (content already imported)', async () => {
    const { prisma, assets, release } = makeDeps();
    prisma.theme.count = jest.fn().mockResolvedValue(1);
    const svc = new ImporterService(
      { client: prisma } as any,
      assets as any,
      release as any,
    );
    await expect(svc.run()).rejects.toThrow(/already imported|theme already exists/i);
    expect(prisma.theme.create).not.toHaveBeenCalled();
    expect(release.publish).not.toHaveBeenCalled();
  });

  it('asserts publish returned "published" status (not noop)', async () => {
    const { prisma, assets, release } = makeDeps();
    release.publish = jest.fn(async () => ({ status: 'noop' as const })) as any;
    const svc = new ImporterService(
      { client: prisma } as any,
      assets as any,
      release as any,
    );
    await expect(svc.run()).rejects.toThrow(/noop|not published/i);
  });
});
