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
  @Get('snapshot')
  @Post('snapshot')
  @Public()
  async snapshot(
    @Headers('x-preview-secret') secret: string | undefined,
    @Query('themeId') queryThemeId?: string,
    @Body() body?: { themeId?: string },
  ): Promise<ReleaseSnapshot> {
    const expected = process.env.PREVIEW_SECRET;
    if (!expected || secret !== expected) {
      throw new ForbiddenException('Invalid preview secret');
    }

    let themeId = queryThemeId ?? body?.themeId;
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

    const theme = await this.prisma.client.theme.findUniqueOrThrow({
      where: { id: themeId },
      select: { draftSnapshot: true },
    });
    return theme.draftSnapshot as unknown as ReleaseSnapshot;
  }
}
