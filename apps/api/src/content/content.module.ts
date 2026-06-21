import { Module } from '@nestjs/common';
import { WorkingStateModule } from '../working-state/working-state.module';
import { AuditModule } from '../audit/audit.module';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';

@Module({
  imports: [WorkingStateModule, AuditModule],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
