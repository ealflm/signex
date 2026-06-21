/**
 * Loaded by jest-e2e.json setupFilesAfterEach — loads the monorepo root .env
 * so DATABASE_URL and other vars are available to Prisma + the NestJS app
 * during e2e tests (no .env lives in apps/api itself).
 */
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
