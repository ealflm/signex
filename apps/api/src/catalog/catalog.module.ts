import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RevalidationModule } from '../revalidation/revalidation.module';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';

@Module({
  imports: [AuditModule, RevalidationModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
