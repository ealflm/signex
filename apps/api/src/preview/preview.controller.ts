import { Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import type { ReleaseSnapshot } from '@signex/shared';
import { Public } from '../common/decorators/public.decorator';
import { SnapshotSerializer } from '../release/snapshot.serializer';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Preview endpoint — returns the live working snapshot (draft state) for
 * draft-mode preview and the acceptance gate.
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
  constructor(
    private readonly serializer: SnapshotSerializer,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /api/preview/snapshot
   * Header: x-preview-secret: <PREVIEW_SECRET>
   * Returns: ReleaseSnapshot (working state, not published)
   */
  @Post('snapshot')
  @Public()
  async snapshot(
    @Headers('x-preview-secret') secret: string | undefined,
  ): Promise<ReleaseSnapshot> {
    const expected = process.env.PREVIEW_SECRET;
    if (!expected || secret !== expected) {
      throw new ForbiddenException('Invalid preview secret');
    }
    const { snapshot } = await this.serializer.serialize(this.prisma.client);
    return snapshot;
  }
}
