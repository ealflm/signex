import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CatalogDraftService } from './catalog-draft.service';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';

@Module({
  imports: [AuditModule],
  controllers: [CatalogController],
  providers: [CatalogService, CatalogDraftService],
  exports: [CatalogService, CatalogDraftService],
})
export class CatalogModule {}
