import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import type { CatalogRelease, User } from '@signex/db';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CatalogReleaseService,
  type CatalogPublishResult,
} from './catalog-release.service';
import {
  catalogPublishSchema,
  catalogRollbackSchema,
  type CatalogPublishInput,
  type CatalogRollbackInput,
} from './dto/catalog-release.dto';

/**
 * The GLOBAL catalog release track — publish / rollback / history, independent
 * of the content release (`/api/releases`). Publish + rollback require
 * PUBLISHER; history reads are EDITOR+.
 */
@Controller('catalog/releases')
export class CatalogReleaseController {
  constructor(private readonly releases: CatalogReleaseService) {}

  @Get()
  @Roles('EDITOR')
  list(): Promise<CatalogRelease[]> {
    return this.releases.listReleases();
  }

  @Get('live')
  @Roles('EDITOR')
  live(): Promise<{
    version: number;
    checksum: string;
    publishedAt: Date;
    snapshot: unknown;
  } | null> {
    return this.releases.getLive();
  }

  @Get(':version')
  @Roles('EDITOR')
  byVersion(
    @Param('version', ParseIntPipe) version: number,
  ): Promise<CatalogRelease | null> {
    return this.releases.getByVersion(version);
  }

  @Post('publish')
  @Roles('PUBLISHER')
  publish(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(catalogPublishSchema)) body: CatalogPublishInput,
  ): Promise<CatalogPublishResult> {
    return this.releases.publish(user, body);
  }

  @Post('rollback')
  @Roles('PUBLISHER')
  rollback(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(catalogRollbackSchema))
    body: CatalogRollbackInput,
  ): Promise<{ version: number; releaseId: string }> {
    return this.releases.rollback(user, body);
  }
}
