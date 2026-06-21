/**
 * Deterministic id for the fixed SYSTEM / ADMIN user created by `auth:seed`.
 * Stable across every environment so the importer (build step 7) can reference
 * the system actor (createdById / Asset.uploadedById) by a known constant
 * without a lookup. Shaped like a cuid (25 chars, letter-led, [a-z0-9]) so it
 * satisfies the String @id column and `@signex/shared`'s cuid-ish id schema.
 */
export const SYSTEM_USER_ID = 'seedsystemadmin0000000000';

export interface SeedAdminConfig {
  email: string;
  name: string;
  password: string;
}

const MIN_PASSWORD_LEN = 12;

function required(env: NodeJS.ProcessEnv, key: string): string {
  const raw = env[key];
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length === 0) {
    throw new Error(`Seed failed: ${key} is required (set it in your .env).`);
  }
  return value;
}

/**
 * Reads + validates the SEED_ADMIN_* environment into a typed config.
 * Pure: takes an explicit env (defaults to process.env) so it is unit-testable.
 */
export function readSeedAdminConfig(
  env: NodeJS.ProcessEnv = process.env,
): SeedAdminConfig {
  const email = required(env, 'SEED_ADMIN_EMAIL');
  const name = required(env, 'SEED_ADMIN_NAME');
  const password = required(env, 'SEED_ADMIN_PASSWORD');
  if (password.length < MIN_PASSWORD_LEN) {
    throw new Error(
      `Seed failed: SEED_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LEN} characters.`,
    );
  }
  return { email, name, password };
}
