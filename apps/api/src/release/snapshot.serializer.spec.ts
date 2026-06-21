import { SnapshotSerializer } from './snapshot.serializer';
import { canonicalJson } from './canonical-json';

// Minimal hand-rolled fake of the Prisma client surface the serializer touches.
function makeAsset(over: Partial<any> = {}) {
  return {
    id: 'clqt5s0000000000000000001',
    r2Key: 'originals/aaaa/logo.svg',
    mime: 'image/svg+xml',
    width: 200,
    height: 80,
    poster: null,
    ...over,
  };
}

function makeClient(over: Partial<any> = {}) {
  const catImg = makeAsset({
    id: 'clqt5s0000000000000000002',
    r2Key: 'originals/bbbb/cat.jpg',
    mime: 'image/jpeg',
  });
  const prodImg = makeAsset({
    id: 'clqt5s0000000000000000003',
    r2Key: 'originals/cccc/prod.jpg',
    mime: 'image/jpeg',
  });
  return {
    workingState: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'singleton',
        revision: 7,
        lastPublishedRevision: 3,
      }),
    },
    contentBlock: {
      findMany: jest.fn().mockResolvedValue(blockRows()),
    },
    category: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'clqt5s0000000000000000010',
          slug: 'pvc',
          sortOrder: 0,
          title: { en: 'PVC', vi: 'PVC' },
          tag: { en: 'PVC', vi: 'PVC' },
          intro: { en: 'i', vi: 'i' },
          productCount: 18,
          materialCount: 4,
          imageId: catImg.id,
          image: catImg,
          imageAlt: { en: 'cat alt', vi: 'cat alt' },
          products: [
            {
              id: 'clqt5s0000000000000000020',
              slug: 'p1',
              sortOrder: 0,
              title: { en: 'P1', vi: 'P1' },
              tag: { en: 't', vi: 't' },
              desc: { en: 'd', vi: 'd' },
              imageId: prodImg.id,
              image: prodImg,
              imageAlt: { en: 'prod alt', vi: 'prod alt' },
            },
          ],
        },
      ]),
    },
    ...over,
  } as any;
}

// Every BLOCK_REGISTRY key must be present and valid; the importer guarantees
// this at runtime. For the unit test we feed pre-validated block data fixtures.
function blockRows() {
  // Loaded lazily so the test file does not duplicate the whole registry shape.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fixtures = require('./__fixtures__/blocks.fixture').BLOCK_FIXTURES as Record<
    string,
    unknown
  >;
  return Object.entries(fixtures).map(([key, data], i) => ({
    id: `clqt5s000000000000000${String(i).padStart(4, '0')}`,
    kind: keyKind(key),
    key,
    data,
  }));
}
function keyKind(key: string): string {
  if (key === 'businessContact' || key === 'formConfig') return 'SETTINGS';
  if (key === 'nav') return 'NAV';
  if (key === 'meta') return 'SEO';
  return 'PAGE';
}

describe('SnapshotSerializer', () => {
  const serializer = new SnapshotSerializer();

  it('freezes assets to r2Key (never an absolute URL) and validates against the schema', async () => {
    const client = makeClient();
    const { snapshot } = await serializer.serialize(client);

    expect(snapshot.schemaVersion).toBe(1);
    const cat = snapshot.catalog.categories[0] as any;
    expect(cat.image.r2Key).toBe('originals/bbbb/cat.jpg');
    expect(cat.image.assetId).toBe('clqt5s0000000000000000002');
    expect(cat.image.variants).toEqual([]);
    // No asset r2Key is a resolved absolute URL — web resolves MEDIA_PUBLIC_BASE + r2Key at read time.
    const allR2Keys = JSON.stringify(snapshot).match(/"r2Key":"([^"]+)"/g) ?? [];
    for (const match of allR2Keys) {
      expect(match).not.toMatch(/https?:\/\//);
    }
  });

  it('freezes video poster + webm r2Keys', async () => {
    const poster = makeAsset({
      id: 'clqt5s0000000000000000010',
      r2Key: 'originals/poster/p.jpg',
      mime: 'image/jpeg',
    });
    const webm = makeAsset({
      id: 'clqt5s0000000000000000011',
      r2Key: 'originals/webm/v.webm',
      mime: 'video/webm',
    });
    const mp4 = makeAsset({
      id: 'clqt5s0000000000000000012',
      r2Key: 'originals/mp4/v.mp4',
      mime: 'video/mp4',
      poster,
      posterId: poster.id,
    });
    const frozen = serializer.freezeVideo(mp4, webm, poster);
    expect(frozen.r2Key).toBe('originals/mp4/v.mp4');
    expect(frozen.poster).toEqual({ r2Key: 'originals/poster/p.jpg' });
    expect(frozen.webm).toEqual({ r2Key: 'originals/webm/v.webm' });
  });

  it('produces a deterministic checksum and a deduped assetIds set with fromRevision', async () => {
    const client = makeClient();
    const out1 = await serializer.serialize(client);
    const out2 = await serializer.serialize(makeClient());

    expect(out1.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(out1.checksum).toBe(out2.checksum);
    // checksum is over canonicalJson(snapshot)
    const { createHash } = require('node:crypto');
    expect(out1.checksum).toBe(
      createHash('sha256').update(canonicalJson(out1.snapshot)).digest('hex'),
    );
    expect(out1.fromRevision).toBe(7);
    expect(new Set(out1.assetIds).size).toBe(out1.assetIds.length);
    expect(out1.assetIds).toEqual(
      expect.arrayContaining([
        'clqt5s0000000000000000002',
        'clqt5s0000000000000000003',
      ]),
    );
  });
});
