import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SeedService } from './seed.service';

@Module({
  imports: [],
  controllers: [AuthController],
  providers: [AuthService, SeedService],
  exports: [AuthService, SeedService],
})
export class AuthModule {}
