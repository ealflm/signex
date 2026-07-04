import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SeedService } from './seed.service';
import { readSeedAdminConfig } from './seed-config';

/**
 * Deploy-order step (spec §8):
 *   1. npm run migrate:deploy -w @signex/db   (tables + release_version_seq)
 *   2. npm run auth:seed -w @signex/api        (<-- THIS)  fixed SYSTEM/ADMIN user
 *   3. importer (build step 7)                 (Release v1, system actor = SYSTEM_USER_ID)
 *
 * Idempotent: safe to re-run on every deploy.
 */
async function main(): Promise<void> {
  const logger = new Logger('auth:seed');
  const cfg = readSeedAdminConfig(); // throws (and we exit 1) if SEED_ADMIN_* missing/invalid

  // Standalone context: no HTTP server, just the DI container.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const seeder = app.get(SeedService);
    const { id, created } = await seeder.seedAdmin(cfg);
    logger.log(
      `auth:seed done — system admin ${cfg.username} (${id}) ${created ? 'created' : 'already present (updated)'}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error(`auth:seed failed: ${(err as Error).message}`);
  process.exit(1);
});
