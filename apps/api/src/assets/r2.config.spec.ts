import { loadR2Config } from './r2.config';

const base = {
  R2_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  R2_ACCESS_KEY_ID: 'ak',
  R2_SECRET_ACCESS_KEY: 'sk',
  R2_BUCKET: 'signex-media',
  MEDIA_PUBLIC_BASE: 'https://media.signex.test',
} as unknown as NodeJS.ProcessEnv;

describe('loadR2Config', () => {
  it('parses required vars and applies defaults', () => {
    const cfg = loadR2Config(base);
    expect(cfg.endpoint).toBe('https://acc.r2.cloudflarestorage.com');
    expect(cfg.bucket).toBe('signex-media');
    expect(cfg.publicBase).toBe('https://media.signex.test');
    expect(cfg.region).toBe('auto');
    expect(cfg.presignTtlSeconds).toBe(300);
  });

  it('honors R2_REGION + R2_PRESIGN_TTL overrides', () => {
    const cfg = loadR2Config({
      ...base,
      R2_REGION: 'wnam',
      R2_PRESIGN_TTL: '120',
    });
    expect(cfg.region).toBe('wnam');
    expect(cfg.presignTtlSeconds).toBe(120);
  });

  it('throws when a required var is missing', () => {
    const { R2_BUCKET: _omit, ...partial } = base as Record<string, string>;
    expect(() => loadR2Config(partial as NodeJS.ProcessEnv)).toThrow(
      /R2_BUCKET/,
    );
  });
});
