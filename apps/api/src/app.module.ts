import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WorkingStateModule } from './working-state/working-state.module';
import { AuditModule } from './audit/audit.module';
import { ContentModule } from './content/content.module';
import { CatalogModule } from './catalog/catalog.module';
import { AssetsModule } from './assets/assets.module';
import { ReleaseModule } from './release/release.module';
import { OriginGuard, ALLOWED_ORIGINS } from './auth/guards/origin.guard';
import { SessionAuthGuard } from './auth/guards/session-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    WorkingStateModule,
    AuditModule,
    ContentModule,
    CatalogModule,
    AssetsModule,
    ReleaseModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: ALLOWED_ORIGINS,
      useFactory: (): string[] =>
        (process.env.ALLOWED_ORIGINS ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
    },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
