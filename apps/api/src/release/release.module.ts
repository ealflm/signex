import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { RevalidationModule } from '../revalidation/revalidation.module';
import { ReleaseController } from './release.controller';
import { ReleaseService } from './release.service';
import { SnapshotSerializer } from './snapshot.serializer';

@Module({
  imports: [PrismaModule, AuditModule, RevalidationModule],
  controllers: [ReleaseController],
  providers: [ReleaseService, SnapshotSerializer],
  exports: [ReleaseService],
})
export class ReleaseModule {}
