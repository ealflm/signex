import { Module } from '@nestjs/common';
import { RevalidationService } from './revalidation.service';

@Module({
  providers: [RevalidationService],
  exports: [RevalidationService],
})
export class RevalidationModule {}
