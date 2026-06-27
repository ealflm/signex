import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { RevalidationModule } from '../revalidation/revalidation.module';
import { ReleaseController } from './release.controller';
import { ReleaseService } from './release.service';

@Module({
  imports: [PrismaModule, AuditModule, RevalidationModule],
  controllers: [ReleaseController],
  providers: [ReleaseService],
  exports: [ReleaseService],
})
export class ReleaseModule {}
