import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { SeedService } from './auth/seed.service';
import { readSeedAdminConfig } from './auth/seed-config';
import { ImporterModule } from './importer/importer.module';
import { ImporterService } from './importer/importer.service';

// ---------------------------------------------------------------------------
// `node dist/main seed` — standalone bootstrap: auth:seed + importer (idempotent)
// Used by docker compose exec / CI acceptance gate (test/acceptance.sh step 1).
// Runs instead of the HTTP server; exits 0 on success.
// ---------------------------------------------------------------------------
async function runSeed(): Promise<void> {
  const logger = new Logger('seed');

  // 1. auth:seed — upsert SYSTEM/ADMIN user (idempotent).
  const seedApp = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const cfg = readSeedAdminConfig();
    const seeder = seedApp.get(SeedService);
    const { id, created } = await seeder.seedAdmin(cfg);
    logger.log(
      `auth:seed — ${cfg.username} (${id}) ${created ? 'created' : 'already present (updated)'}`,
    );
  } finally {
    await seedApp.close();
  }

  // 2. importer — mint Release v1 (idempotent: no-ops when releases already exist).
  const importApp = await NestFactory.createApplicationContext(ImporterModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const importer = importApp.get(ImporterService);
    const res = await importer.run();
    logger.log(
      `content:import — Release v${res.version} (${res.releaseId}); snapshot → ${res.snapshotPath}`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Idempotency: importer refuses to re-run when a Release row already exists.
    // Treat this as a non-fatal no-op so the seed step is re-runnable.
    if (
      msg.includes('already imported') ||
      msg.includes('content already imported')
    ) {
      logger.log('content:import — already imported, skipping (idempotent)');
    } else {
      throw err;
    }
  } finally {
    await importApp.close();
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableShutdownHooks();

  // CORS — share the same allow-list as OriginGuard (AUTH_ALLOWED_ORIGINS).
  // In dev, if the env var is unset, reflect every origin (true) so local
  // `npm run dev` works without extra config.
  const corsOrigins = (process.env.AUTH_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-preview-secret',
      'x-revalidate-secret',
    ],
  });

  const port = process.env.API_PORT ?? 3060;
  await app.listen(port, '0.0.0.0');
}

if (process.argv.includes('seed')) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('seed failed:', (err as Error).message ?? err);
      process.exit(1);
    });
} else {
  void bootstrap();
}
