import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PreviewController } from './preview.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PreviewController],
})
export class PreviewModule {}
