import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { WorkingStateService } from './working-state.service';

@Controller('working-state')
export class WorkingStateController {
  constructor(private readonly workingState: WorkingStateService) {}

  @Get()
  @Roles('EDITOR')
  async get(): Promise<{
    revision: number;
    lastPublishedRevision: number;
    dirty: boolean;
  }> {
    const s = await this.workingState.readState();
    return { ...s, dirty: s.revision !== s.lastPublishedRevision };
  }
}
