import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RevalidationModule } from '../revalidation/revalidation.module';
import { CatalogDraftService } from './catalog-draft.service';
import { CatalogService } from './catalog.service';
import { CatalogReleaseService } from './catalog-release.service';
import { CatalogController } from './catalog.controller';
import { CatalogReleaseController } from './catalog-release.controller';

@Module({
  imports: [AuditModule, RevalidationModule],
  controllers: [CatalogController, CatalogReleaseController],
  providers: [CatalogService, CatalogDraftService, CatalogReleaseService],
  exports: [CatalogService, CatalogDraftService, CatalogReleaseService],
})
export class CatalogModule {}
