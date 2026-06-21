import { ImporterService } from './importer.service';

// ---------------------------------------------------------------------------
// Stubs for heavy importer helpers — not under test here (unit level)
// ---------------------------------------------------------------------------
jest.mock('./dict-source', () => ({
  loadDicts: jest.fn(() => ({ en: {}, vi: {} })),
  resolveRepoRoot: jest.fn(() => '/tmp/repo'),
}));
jest.mock('./parity', () => ({ assertParity: jest.fn() }));
jest.mock('./asset-importer', () => ({
  importAssets: jest.fn(async () => new Map()),
}));
jest.mock('./catalog-builder', () => ({
  buildCatalog: jest.fn(() => ({ categories: [] })),
}));
jest.mock('./block-builder', () => ({
  buildBlocks: jest.fn(() => []),
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
  const tx = {
    asset: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => data),
    },
    category: {
      create: jest.fn(async ({ data }: any) => ({ id: 'c', ...data })),
    },
    product: {
      create: jest.fn(async ({ data }: any) => ({ id: 'p', ...data })),
    },
    contentBlock: { upsert: jest.fn(async ({ create }: any) => create) },
    workingState: {
      upsert: jest.fn(async () => ({ revision: 1 })),
      update: jest.fn(async () => ({ revision: 1 })),
    },
  };

  const prisma = {
    // Advisory lock — default: acquired
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    $queryRawUnsafe: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) {
        return Promise.resolve([{ pg_try_advisory_lock: true }]);
      }
      // pg_advisory_unlock
      return Promise.resolve([{ pg_advisory_unlock: true }]);
    }),
    // Single transaction call
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    user: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'sys', email: 'a@b.c', role: 'ADMIN' }),
    },
    workingState: {
      findUnique: jest.fn().mockResolvedValue({ id: 'singleton', revision: 1 }),
    },
    release: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'r1',
        snapshot: {
          schemaVersion: 1,
          blocks: {
            hero: {
              titleTop: { en: '', vi: '' },
              titleBottom: { en: '', vi: '' },
              subtitle: { en: '', vi: '' },
              image: { assetId: 'a1', alt: { en: '', vi: '' } },
            },
            features: {
              eyebrow: { en: '', vi: '' },
              title: { top: { en: '', vi: '' }, bottom: { en: '', vi: '' } },
              cta: { label: { en: '', vi: '' }, href: '' },
              video: {
                title: { en: '', vi: '' },
                text: { en: '', vi: '' },
                media: {
                  posterAssetId: 'a1',
                  mp4AssetId: 'a1',
                  webmAssetId: 'a1',
                },
              },
              featured: { title: { en: '', vi: '' }, desc: { en: '', vi: '' } },
              cards: [],
            },
            about: {
              eyebrow: { en: '', vi: '' },
              title: { top: { en: '', vi: '' }, bottom: { en: '', vi: '' } },
              body: { en: '', vi: '' },
              mission: {
                title: { en: '', vi: '' },
                body: { en: '', vi: '' },
                items: [],
              },
              vision: { title: { en: '', vi: '' }, body: { en: '', vi: '' } },
              values: { title: { en: '', vi: '' }, body: { en: '', vi: '' } },
            },
            productsHeader: {
              eyebrow: { en: '', vi: '' },
              title: { top: { en: '', vi: '' }, bottom: { en: '', vi: '' } },
              body: { en: '', vi: '' },
              statLabels: {
                products: { en: '', vi: '' },
                materials: { en: '', vi: '' },
              },
              detail: {
                listTitle: {
                  top: { en: '', vi: '' },
                  bottom: { en: '', vi: '' },
                },
              },
              product: {
                categoryLabel: { en: '', vi: '' },
                materialLabel: { en: '', vi: '' },
                cta: { en: '', vi: '' },
                ctaHref: '',
                back: { en: '', vi: '' },
                zoomHint: { en: '', vi: '' },
              },
            },
            aboutPage: {
              hero: {
                title: { top: { en: '', vi: '' }, bottom: { en: '', vi: '' } },
                subtitle: { en: '', vi: '' },
              },
              testimonial: {
                eyebrow: { en: '', vi: '' },
                title: { top: { en: '', vi: '' }, bottom: { en: '', vi: '' } },
                body: [],
              },
              approach: [],
              intro: {
                eyebrow: { en: '', vi: '' },
                title: { top: { en: '', vi: '' }, bottom: { en: '', vi: '' } },
                body: { en: '', vi: '' },
              },
              capability: {
                eyebrow: { en: '', vi: '' },
                title: { top: { en: '', vi: '' }, bottom: { en: '', vi: '' } },
                body: { en: '', vi: '' },
                groups: [],
                closing: [],
              },
              process: {
                eyebrow: { en: '', vi: '' },
                title: { top: { en: '', vi: '' }, bottom: { en: '', vi: '' } },
                body: { en: '', vi: '' },
                steps: [],
              },
              timeline: {
                eyebrow: { en: '', vi: '' },
                title: { top: { en: '', vi: '' }, bottom: { en: '', vi: '' } },
                body: { en: '', vi: '' },
                intro: [],
                milestones: [],
              },
            },
            contactPage: {
              hero: {
                title: { top: { en: '', vi: '' }, bottom: { en: '', vi: '' } },
                subtitle: { en: '', vi: '' },
              },
              map: {
                eyebrow: { en: '', vi: '' },
                title: { top: { en: '', vi: '' }, bottom: { en: '', vi: '' } },
              },
            },
            notFound: {
              eyebrow: { en: '', vi: '' },
              title: { top: { en: '', vi: '' }, bottom: { en: '', vi: '' } },
              body: { en: '', vi: '' },
              cta: { label: { en: '', vi: '' }, href: '' },
              image: { assetId: 'a1', alt: { en: '', vi: '' } },
            },
            footer: {
              tagline: [],
              contactHeading: { en: '', vi: '' },
              quickHeading: { en: '', vi: '' },
              links: [],
              shipLabel: { en: '', vi: '' },
              payLabel: { en: '', vi: '' },
              payments: [],
            },
            businessContact: {
              legalName: { en: '', vi: '' },
              brand: { en: '', vi: '' },
              emails: [],
              phones: [],
              taxId: '',
              taxLabel: { en: '', vi: '' },
              sites: [],
              social: [],
            },
            formConfig: {
              fields: {
                name: { label: { en: '', vi: '' }, required: true },
                email: { label: { en: '', vi: '' }, required: true },
                phone: { label: { en: '', vi: '' }, required: true },
                quantity: { label: { en: '', vi: '' } },
                standard: { label: { en: '', vi: '' } },
                height: { label: { en: '', vi: '' } },
                width: { label: { en: '', vi: '' } },
                thickness: { label: { en: '', vi: '' } },
                upload: { label: { en: '', vi: '' } },
                message: { label: { en: '', vi: '' } },
              },
              uploadHelp: { en: '', vi: '' },
              standardOptions: [],
              submit: { en: '', vi: '' },
              success: { en: '', vi: '' },
              fail: { en: '', vi: '' },
            },
            nav: {
              skip: { en: '', vi: '' },
              logo: { assetId: 'a1' },
              cta: { label: { en: '', vi: '' }, href: '' },
              links: [],
            },
            meta: {
              siteName: '',
              siteUrl: '',
              themeColor: '',
              title: { en: '', vi: '' },
              description: { en: '', vi: '' },
              ogImage: { assetId: 'a1', alt: { en: '', vi: '' } },
              favicons: [],
              about: {
                title: { en: '', vi: '' },
                description: { en: '', vi: '' },
              },
              contact: {
                title: { en: '', vi: '' },
                description: { en: '', vi: '' },
              },
            },
          },
          catalog: { categories: [] },
          assets: {},
        },
      }),
      count: jest.fn().mockResolvedValue(0),
    },
  };

  // AssetsService mock — register returns an AssetDto-shaped object
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

  // ReleaseService mock — publish returns the actual PublishResult type
  const release = {
    publish: jest.fn(async () => ({
      status: 'published' as const,
      version: 1,
      releaseId: 'r1',
    })),
  };

  return { prisma, assets, release, tx };
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

  it('runs exclusively, persists in one tx, mints v1 via release.publish with the system actor, emits snapshot', async () => {
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

    // Advisory lock was attempted
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('pg_try_advisory_lock'),
    );
    // Single tx => single revision bump
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Release published exactly once
    expect(release.publish).toHaveBeenCalledTimes(1);
    const [actor, args] = release.publish.mock.calls[0];
    expect(actor.id).toBe('sys');
    expect(args.expectedRevision).toBe(1);
    // Snapshot read from the Release row
    expect(prisma.release.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'r1' },
    });
    // Return contains expected fields
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
    await expect(svc.run()).rejects.toThrow(/already (running|imported)|lock/i);
    // Must NOT proceed to publish
    expect(release.publish).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to run when content already imported (release exists)', async () => {
    const { prisma, assets, release } = makeDeps();
    prisma.release.count = jest.fn().mockResolvedValue(1);
    const svc = new ImporterService(
      { client: prisma } as any,
      assets as any,
      release as any,
    );
    await expect(svc.run()).rejects.toThrow(/already imported|release exists/i);
    expect(release.publish).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('asserts publish returned "published" status (not noop)', async () => {
    const { prisma, assets, release } = makeDeps();
    release.publish = jest.fn(async () => ({ status: 'noop' as const }));
    const svc = new ImporterService(
      { client: prisma } as any,
      assets as any,
      release as any,
    );
    await expect(svc.run()).rejects.toThrow(/noop|not published/i);
  });
});
