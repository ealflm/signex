import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import type { Release, User } from '@signex/db';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ReleaseService, type PublishResult } from './release.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import {
  publishSchema,
  rollbackSchema,
  type PublishInput,
  type RollbackInput,
} from './dto/release.dto';

@Controller('releases')
export class ReleaseController {
  constructor(
    private readonly releases: ReleaseService,
    private readonly revalidation: RevalidationService,
  ) {}

  @Get()
  @Roles('EDITOR')
  list(): Promise<Release[]> {
    return this.releases.listReleases();
  }

  @Get('live')
  @Roles('EDITOR')
  live(): Promise<{
    version: number;
    checksum: string;
    publishedAt: Date;
  } | null> {
    return this.releases.getLive();
  }

  @Get('diff')
  @Roles('EDITOR')
  diff(): Promise<{
    dirty: boolean;
    revision: number;
    lastPublishedRevision: number;
  }> {
    return this.releases.diff();
  }

  @Get(':version')
  @Roles('EDITOR')
  byVersion(@Param('version', ParseIntPipe) version: number): Promise<Release | null> {
    return this.releases.getByVersion(version);
  }

  @Post('publish')
  @Roles('PUBLISHER')
  publish(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(publishSchema)) body: PublishInput,
  ): Promise<PublishResult> {
    return this.releases.publish(user, body);
  }

  @Post('rollback')
  @Roles('PUBLISHER')
  rollback(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(rollbackSchema)) body: RollbackInput,
  ): Promise<{ version: number; releaseId: string }> {
    return this.releases.rollback(user, body);
  }

  @Post(':version/revalidate')
  @Roles('PUBLISHER')
  revalidate(@Param('version', ParseIntPipe) _version: number): Promise<{ drained: number }> {
    return this.revalidation.reFire();
  }
}
