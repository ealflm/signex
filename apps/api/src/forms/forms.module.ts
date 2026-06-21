import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AssetsModule } from '../assets/assets.module';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';

@Module({
  imports: [PrismaModule, AssetsModule],
  controllers: [FormsController],
  providers: [FormsService],
})
export class FormsModule {}
