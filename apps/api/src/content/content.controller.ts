import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
} from '@nestjs/common';
import { BlockKind } from '@signex/db';
import { z } from '@signex/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ContentService } from './content.service';
import type { AuthedUser } from '../auth/auth.types';

const updateBlockBody = z.object({
  data: z.unknown(),
  expectedRevision: z.number().int().nonnegative(),
});
type UpdateBlockBody = z.infer<typeof updateBlockBody>;

const KINDS = new Set<string>(Object.values(BlockKind));

function toKind(raw: string): BlockKind {
  const upper = raw.toUpperCase();
  if (!KINDS.has(upper)) {
    throw new BadRequestException({ code: 'UNKNOWN_KIND', message: `Unknown block kind "${raw}"` });
  }
  return upper as BlockKind;
}

@Controller('content/blocks')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Put(':kind/:key')
  @Roles('EDITOR')
  async update(
    @Param('kind') kind: string,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(updateBlockBody)) body: UpdateBlockBody,
    @CurrentUser() actor: AuthedUser,
  ): Promise<{ revision: number }> {
    return this.content.updateBlock(actor, toKind(kind), key, body.data, body.expectedRevision);
  }

  @Get(':kind/:key')
  @Roles('EDITOR')
  async get(@Param('kind') kind: string, @Param('key') key: string): Promise<unknown> {
    return this.content.getBlock(toKind(kind), key);
  }
}
