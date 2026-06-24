/**
 * Host-run backfill: repopulate the media bucket from the committed source files.
 *
 * The api container image does NOT ship apps/web/public/assets, so (like
 * forms:seed-samples) this runs on the HOST against a reachable storage endpoint:
 *
 *   npm run build -w @signex/api
 *   R2_ENDPOINT=http://localhost:9000 R2_PUBLIC_ENDPOINT=http://localhost:9000 \
 *   R2_ACCESS_KEY_ID=minioadmin R2_SECRET_ACCESS_KEY=minioadmin \
 *   R2_BUCKET=signex-media MEDIA_PUBLIC_BASE=http://localhost:9000/signex-media \
 *     npm run assets:backfill-storage -w @signex/api
 *
 * It iterates the ASSET_MANIFEST unique relPaths, reads each file from
 * <repoRoot>/apps/web/public/assets/<relPath>, and re-uploads the (SVG-sanitized,
 * content-addressed) bytes via AssetsService.reuploadBytes — WITHOUT touching the DB.
 * Because the hash/key are derived exactly as register() does, every object lands at the
 * r2Key already recorded on its READY Asset row. Idempotent: re-uploading is a no-op
 * overwrite. It does NOT create/modify any rows.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AssetsService } from './assets.service';
import { R2Service } from './r2.service';
import { loadR2Config } from './r2.config';
import { PrismaService } from '../prisma/prisma.service';
import { ASSET_MANIFEST } from '../importer/asset-manifest';
import { resolveRepoRoot } from '../importer/dict-source';

const ASSETS_DIR = join('apps', 'web', 'public', 'assets');

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  // Construct the providers standalone from process.env (no Nest DI), like other CLI scripts.
  const r2 = new R2Service(loadR2Config(process.env));
  const prisma = new PrismaService();
  const assets = new AssetsService(prisma, r2);

  // Group by relPath so each unique source file is uploaded exactly once.
  const relPaths = [...new Set(ASSET_MANIFEST.map((e) => e.relPath))];
  const byRelPath = new Map(ASSET_MANIFEST.map((e) => [e.relPath, e.mime]));

  let count = 0;
  for (const relPath of relPaths) {
    const mime = byRelPath.get(relPath)!;
    const bytes = readFileSync(join(repoRoot, ASSETS_DIR, relPath));
    const originalName = relPath.split('/').pop()!;
    const r2Key = await assets.reuploadBytes({ bytes, mime, originalName });
    count += 1;
    console.log(`assets:backfill-storage — uploaded ${relPath} → ${r2Key}`);
  }

  console.log(
    `assets:backfill-storage — done: ${count} unique source files uploaded`,
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`assets:backfill-storage FAILED — ${message}`, stack);
  process.exit(1);
});
