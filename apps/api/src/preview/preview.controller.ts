import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import type { ReleaseSnapshot } from '@signex/shared';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Preview endpoint — returns a theme's editable `draftSnapshot` for draft-mode
 * preview and the acceptance gate.
 *
 * @Public() bypasses SessionAuthGuard + RolesGuard + OriginGuard; the
 * PREVIEW_SECRET header is the sole gate (server-to-server call).
 *
 * Consumed by:
 *  - apps/web: getPreviewSnapshot() (preview island — server-side fetch)
 *  - test/acceptance.sh step 5 (verify edit is visible before publish)
 *  - apps/admin: preview island POST /api/preview/snapshot
 */
@Controller('preview')
export class PreviewController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET/POST /api/preview/snapshot?themeId=<id>  (themeId may also be in the body)
   * Header: x-preview-secret: <PREVIEW_SECRET>
   * Returns: the theme's draftSnapshot (working state, not the published release).
   * When themeId is omitted, falls back to the currently live theme's draft.
   */
  // NOTE: NestJS does NOT register two HTTP-method decorators stacked on one
  // handler (the last-applied wins) — that silently 404s the other verb. The web
  // preview island calls this with POST, so both verbs MUST be real routes. We
  // register two thin handlers that delegate to one private resolver.
  @Get('snapshot')
  @Public()
  snapshotGet(
    @Headers('x-preview-secret') secret: string | undefined,
    @Query('themeId') themeId?: string,
  ): Promise<ReleaseSnapshot> {
    return this.resolve(secret, themeId);
  }

  @Post('snapshot')
  @Public()
  snapshotPost(
    @Headers('x-preview-secret') secret: string | undefined,
    @Query('themeId') queryThemeId?: string,
    @Body() body?: { themeId?: string },
  ): Promise<ReleaseSnapshot> {
    return this.resolve(secret, queryThemeId ?? body?.themeId);
  }

  private async resolve(
    secret: string | undefined,
    themeIdArg?: string,
  ): Promise<ReleaseSnapshot> {
    const expected = process.env.PREVIEW_SECRET;
    if (!expected || secret !== expected) {
      throw new ForbiddenException('Invalid preview secret');
    }

    let themeId = themeIdArg;
    if (!themeId) {
      // Default to the live theme (the one the PublishedPointer resolves to).
      const pointer = await this.prisma.client.publishedPointer.findUnique({
        where: { id: 'singleton' },
        select: { release: { select: { themeId: true } } },
      });
      themeId = pointer?.release?.themeId ?? undefined;
      if (!themeId) {
        throw new NotFoundException('No live theme to preview');
      }
    }

    // Compose: theme draft (blocks/content) + the GLOBAL live catalog. The
    // catalog is its own domain now, so the preview must overlay the live
    // Catalog categories onto the theme's (dormant) snapshot.catalog — else the
    // preview would show a stale catalog frozen in the theme draft.
    const [theme, catalog] = await Promise.all([
      this.prisma.client.theme.findUniqueOrThrow({
        where: { id: themeId },
        select: { draftSnapshot: true },
      }),
      this.prisma.client.catalog.findUnique({
        where: { id: 'singleton' },
        select: { snapshot: true },
      }),
    ]);

    const snap = theme.draftSnapshot as Record<string, unknown>;
    const catalogSnap = catalog?.snapshot as
      | { categories?: unknown[] }
      | undefined;
    const themeCatalog = snap.catalog as { categories?: unknown[] } | undefined;
    const categories =
      catalogSnap?.categories ?? themeCatalog?.categories ?? [];

    return {
      ...snap,
      catalog: { categories },
    } as unknown as ReleaseSnapshot;
  }
}
