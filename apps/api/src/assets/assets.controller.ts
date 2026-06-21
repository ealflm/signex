import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AssetsService } from './assets.service';
import {
  presignSchema,
  confirmSchema,
  altSchema,
  type PresignInput,
  type ConfirmInput,
  type AltInput,
} from './dto/assets.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/auth.types';

@Controller('assets')
@Roles('EDITOR')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post('presign')
  presign(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(presignSchema)) body: PresignInput,
  ) {
    return this.assets.presign(user, body);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(confirmSchema)) _body: ConfirmInput,
  ) {
    return this.assets.confirm(user, id);
  }

  @Post(':id/alt')
  setAlt(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(altSchema)) body: AltInput,
  ) {
    return this.assets.setAlt(user, id, body.alt);
  }

  @Get()
  list(@Query('kind') kind?: string) {
    return this.assets.list({ kind });
  }

  @Get('usage')
  usage(@Query('assetId') assetId: string) {
    return this.assets.usage(assetId);
  }
}
