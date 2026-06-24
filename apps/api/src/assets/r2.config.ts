export const R2_CONFIG = 'R2_CONFIG';

export interface R2Config {
  endpoint: string;
  /**
   * Endpoint baked into the presigned PUT URL handed to the browser. For real R2 this
   * equals `endpoint` (public host); for split-horizon dev (MinIO) the api reaches the
   * store at the internal docker host (`endpoint`, e.g. http://minio:9000) but the browser
   * must hit a host it can resolve (`presignEndpoint`, e.g. http://localhost:9000).
   */
  presignEndpoint: string;
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
  const endpoint = required(env, 'R2_ENDPOINT');
  return {
    endpoint,
    // Defaults to R2_ENDPOINT → prod R2 (public endpoint) is unaffected. Override with
    // R2_PUBLIC_ENDPOINT only for split-horizon dev where the browser host differs.
    presignEndpoint: env.R2_PUBLIC_ENDPOINT?.trim() || endpoint,
    region: env.R2_REGION ?? 'auto',
    accessKeyId: required(env, 'R2_ACCESS_KEY_ID'),
    secretAccessKey: required(env, 'R2_SECRET_ACCESS_KEY'),
    bucket: required(env, 'R2_BUCKET'),
    publicBase: required(env, 'MEDIA_PUBLIC_BASE').replace(/\/+$/, ''),
    presignTtlSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : 300,
  };
}
