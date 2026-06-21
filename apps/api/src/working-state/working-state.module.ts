import { Module } from '@nestjs/common';
import { WorkingStateService } from './working-state.service';
import { WorkingStateController } from './working-state.controller';

@Module({
  providers: [WorkingStateService],
  controllers: [WorkingStateController],
  exports: [WorkingStateService],
})
export class WorkingStateModule {}
