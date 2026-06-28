import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { Theme, User } from '@signex/db';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ThemeService, type ThemeListItem } from './theme.service';
import { saveDraftSchema, type SaveDraftInput } from './save-draft.dto';

@Controller('themes')
export class ThemeController {
  constructor(private readonly themes: ThemeService) {}

  @Get()
  @Roles('EDITOR')
  list(): Promise<ThemeListItem[]> {
    return this.themes.list();
  }

  @Get(':id')
  @Roles('EDITOR')
  get(@Param('id') id: string): Promise<Theme> {
    return this.themes.get(id);
  }

  @Post(':id/duplicate')
  @Roles('EDITOR')
  duplicate(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body('name') name: string,
  ): Promise<Theme> {
    return this.themes.duplicate(user as any, id, name);
  }

  @Patch(':id')
  @Roles('EDITOR')
  rename(@Param('id') id: string, @Body('name') name: string): Promise<Theme> {
    return this.themes.rename(id, name);
  }

  @Delete(':id')
  @Roles('PUBLISHER')
  remove(@Param('id') id: string): Promise<Theme> {
    return this.themes.remove(id);
  }

  @Post(':themeId/save-draft')
  @Roles('EDITOR')
  saveDraft(
    @CurrentUser() user: User,
    @Param('themeId') themeId: string,
    @Body(new ZodValidationPipe(saveDraftSchema)) body: SaveDraftInput,
  ): Promise<{ draftRevision: number }> {
    return this.themes.saveDraft(user as any, themeId, body);
  }
}
