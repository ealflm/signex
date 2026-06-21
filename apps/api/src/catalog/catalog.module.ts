import { Module } from '@nestjs/common';
import { WorkingStateModule } from '../working-state/working-state.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogService } from './catalog.service';

@Module({
  imports: [WorkingStateModule, AuditModule],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
