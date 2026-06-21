import { Module } from '@nestjs/common';
import { WorkingStateModule } from '../working-state/working-state.module';
import { AuditModule } from '../audit/audit.module';
import { ContentService } from './content.service';

// NOTE: ContentController is wired in Task 30. This module intentionally omits
// it until the controller file exists so `nest build` stays clean.

@Module({
  imports: [WorkingStateModule, AuditModule],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
