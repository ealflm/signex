export const R2_CONFIG = 'R2_CONFIG';

export interface R2Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string;
  presignTtlSeconds: number;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env var ${key}`);
  }
  return v;
}

export function loadR2Config(env: NodeJS.ProcessEnv): R2Config {
  const ttlRaw = env.R2_PRESIGN_TTL;
  const ttl = ttlRaw ? Number.parseInt(ttlRaw, 10) : 300;
  return {
    endpoint: required(env, 'R2_ENDPOINT'),
    region: env.R2_REGION ?? 'auto',
    accessKeyId: required(env, 'R2_ACCESS_KEY_ID'),
    secretAccessKey: required(env, 'R2_SECRET_ACCESS_KEY'),
    bucket: required(env, 'R2_BUCKET'),
    publicBase: required(env, 'MEDIA_PUBLIC_BASE').replace(/\/+$/, ''),
    presignTtlSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : 300,
  };
}
