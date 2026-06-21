import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReleaseModule } from '../release/release.module';
import { PreviewController } from './preview.controller';
import { SnapshotSerializer } from '../release/snapshot.serializer';

@Module({
  imports: [PrismaModule, ReleaseModule],
  controllers: [PreviewController],
  providers: [SnapshotSerializer],
})
export class PreviewModule {}
