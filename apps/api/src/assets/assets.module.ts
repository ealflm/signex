import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { R2Service } from './r2.service';
import { R2_CONFIG, loadR2Config } from './r2.config';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AssetsController],
  providers: [
    { provide: R2_CONFIG, useFactory: () => loadR2Config(process.env) },
    R2Service,
    AssetsService,
  ],
  exports: [AssetsService, R2Service],
})
export class AssetsModule {}
