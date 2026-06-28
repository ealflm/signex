import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AuditModule } from './audit/audit.module';
import { CatalogModule } from './catalog/catalog.module';
import { AssetsModule } from './assets/assets.module';
import { ReleaseModule } from './release/release.module';
import { FormsModule } from './forms/forms.module';
import { PreviewModule } from './preview/preview.module';
import { ThemeModule } from './theme/theme.module';
import { SiteConfigModule } from './site-config/site-config.module';
import { OriginGuard, ALLOWED_ORIGINS } from './auth/guards/origin.guard';
import { SessionAuthGuard } from './auth/guards/session-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AuditModule,
    CatalogModule,
    AssetsModule,
    ReleaseModule,
    FormsModule,
    PreviewModule,
    ThemeModule,
    SiteConfigModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: ALLOWED_ORIGINS,
      useFactory: (): string[] =>
        (process.env.AUTH_ALLOWED_ORIGINS ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
    },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Maps Prisma P2002 unique-constraint violations to 409 Conflict.
    // Scoped to the Prisma error class, so Nest HttpExceptions never reach it.
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
