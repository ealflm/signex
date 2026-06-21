import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AssetsModule } from '../assets/assets.module';
import { ReleaseModule } from '../release/release.module';
import { ImporterService } from './importer.service';

@Module({
  imports: [PrismaModule, AssetsModule, ReleaseModule],
  providers: [ImporterService],
  exports: [ImporterService],
})
export class ImporterModule {}
