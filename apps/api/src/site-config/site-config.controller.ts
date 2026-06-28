import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { User } from '@signex/db';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SiteConfigService, type SiteConfigView } from './site-config.service';

@Controller('site-config')
export class SiteConfigController {
  constructor(private readonly siteConfig: SiteConfigService) {}

  /** EDITOR+ may READ so the admin Settings page can show the current id. */
  @Get()
  @Roles('EDITOR')
  get(): Promise<SiteConfigView> {
    return this.siteConfig.get();
  }

  /** ADMIN-only WRITE — GA4 is site-wide infrastructure, not per-theme content. */
  @Patch()
  @Roles('ADMIN')
  update(
    @CurrentUser() user: User,
    @Body() body: { ga4Id?: string },
  ): Promise<SiteConfigView> {
    return this.siteConfig.update(user as any, body);
  }
}
