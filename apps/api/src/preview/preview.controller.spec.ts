import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PreviewController } from './preview.controller';

const DRAFT = {
  schemaVersion: 1,
  blocks: {},
  catalog: { categories: [] },
  assets: {},
};

function makePrisma() {
  return {
    client: {
      theme: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ draftSnapshot: DRAFT }),
      },
      publishedPointer: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ release: { themeId: 'ctheme-live' } }),
      },
      catalogDraft: {
        // default: no global catalog draft → preview keeps the theme's catalog
        findUnique: jest.fn().mockResolvedValue(null),
      },
    },
  };
}

describe('PreviewController.snapshot', () => {
  const SECRET = 's3cr3t';
  let prisma: ReturnType<typeof makePrisma>;
  let controller: PreviewController;

  beforeEach(() => {
    process.env.PREVIEW_SECRET = SECRET;
    prisma = makePrisma();
    controller = new PreviewController(prisma as any);
  });
  afterEach(() => {
    delete process.env.PREVIEW_SECRET;
    jest.clearAllMocks();
  });

  it('rejects an absent secret', async () => {
    await expect(controller.snapshotGet(undefined, 'ctheme-x')).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.client.theme.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret', async () => {
    await expect(controller.snapshotGet('nope', 'ctheme-x')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns the requested theme draftSnapshot (themeId from query)', async () => {
    const res = await controller.snapshotGet(SECRET, 'ctheme-x');
    expect(res).toEqual(DRAFT);
    expect(prisma.client.theme.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'ctheme-x' },
      select: { draftSnapshot: true },
    });
    // themeId provided → no pointer lookup.
    expect(prisma.client.publishedPointer.findUnique).not.toHaveBeenCalled();
  });

  it('overlays the GLOBAL catalog draft onto the theme snapshot', async () => {
    prisma.client.catalogDraft.findUnique.mockResolvedValue({
      draftSnapshot: {
        catalogSchemaVersion: 1,
        categories: [{ slug: 'global-cat' }],
      },
    });
    const res = (await controller.snapshotGet(SECRET, 'ctheme-x')) as any;
    expect(res.catalog).toEqual({ categories: [{ slug: 'global-cat' }] });
    // theme content still comes through
    expect(res.schemaVersion).toBe(1);
  });

  it('accepts themeId from the body', async () => {
    await controller.snapshotPost(SECRET, undefined, { themeId: 'ctheme-body' });
    expect(prisma.client.theme.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'ctheme-body' },
      select: { draftSnapshot: true },
    });
  });

  it('falls back to the live theme when themeId is omitted', async () => {
    const res = await controller.snapshotGet(SECRET);
    expect(prisma.client.publishedPointer.findUnique).toHaveBeenCalled();
    expect(prisma.client.theme.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'ctheme-live' },
      select: { draftSnapshot: true },
    });
    expect(res).toEqual(DRAFT);
  });

  it('throws NotFound when themeId omitted and no live theme exists', async () => {
    prisma.client.publishedPointer.findUnique.mockResolvedValue(null);
    await expect(controller.snapshotGet(SECRET)).rejects.toThrow(
      NotFoundException,
    );
  });
});
