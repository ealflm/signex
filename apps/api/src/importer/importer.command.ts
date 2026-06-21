/**
 * Nest standalone-context command — bootstraps the importer without an HTTP server.
 * Run via: npm run -w @signex/api content:import
 * Compiled to: apps/api/dist/importer/importer.command.js
 *
 * Exit codes:
 *   0 — import succeeded (or idempotency guard short-circuited cleanly)
 *   1 — import failed (advisory lock contention, DB error, schema mismatch, etc.)
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ImporterModule } from './importer.module';
import { ImporterService } from './importer.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(ImporterModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const svc = app.get(ImporterService);
    const res = await svc.run();
    Logger.log(
      `content:import OK — Release v${res.version} (${res.releaseId}); snapshot → ${res.snapshotPath}`,
      'importer',
    );
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  Logger.error(`content:import FAILED — ${message}`, stack, 'importer');
  process.exit(1);
});
