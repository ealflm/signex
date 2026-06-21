import {
  MIME_ALLOWLIST,
  kindForMime,
  slugify,
  keyFor,
  extForMime,
  presignSchema,
} from './assets.dto';

describe('assets dto helpers', () => {
  it('maps mime to kind', () => {
    expect(kindForMime('image/png')).toBe('IMAGE');
    expect(kindForMime('image/avif')).toBe('IMAGE');
    expect(kindForMime('image/svg+xml')).toBe('SVG');
    expect(kindForMime('video/mp4')).toBe('VIDEO');
  });

  it('slugifies original names', () => {
    expect(slugify('Hero Image (Final).PNG')).toBe('hero-image-final-png');
    expect(slugify('  ___ ')).toBe('asset');
    expect(slugify('Ảnh Sản Phẩm')).toBe('anh-san-pham');
  });

  it('builds content-addressed key from first 32 hash chars', () => {
    const sha = 'a'.repeat(64);
    expect(keyFor(sha, 'logo', 'svg')).toBe(`originals/${'a'.repeat(32)}/logo.svg`);
  });

  it('derives extension from mime', () => {
    expect(extForMime('image/jpeg')).toBe('jpg');
    expect(extForMime('image/avif')).toBe('avif');
    expect(extForMime('image/svg+xml')).toBe('svg');
    expect(extForMime('video/webm')).toBe('webm');
  });

  it('presignSchema accepts a valid request', () => {
    const r = presignSchema.parse({
      mime: 'image/png',
      bytes: 1024,
      sha256: 'b'.repeat(64),
      originalName: 'x.png',
    });
    expect(r.mime).toBe('image/png');
  });

  it('presignSchema accepts a valid avif request', () => {
    const r = presignSchema.parse({
      mime: 'image/avif',
      bytes: 1000,
      sha256: 'a'.repeat(64),
      originalName: 'x.avif',
    });
    expect(r.mime).toBe('image/avif');
  });

  it('presignSchema rejects a disallowed mime', () => {
    expect(() =>
      presignSchema.parse({ mime: 'application/zip', bytes: 1, sha256: 'b'.repeat(64), originalName: 'x' }),
    ).toThrow();
  });

  it('presignSchema rejects an oversized image', () => {
    expect(() =>
      presignSchema.parse({
        mime: 'image/png',
        bytes: MIME_ALLOWLIST['image/png'].maxBytes + 1,
        sha256: 'b'.repeat(64),
        originalName: 'x.png',
      }),
    ).toThrow(/size/i);
  });

  it('presignSchema rejects a malformed sha256', () => {
    expect(() =>
      presignSchema.parse({ mime: 'image/png', bytes: 1, sha256: 'zzz', originalName: 'x.png' }),
    ).toThrow();
  });

  // Extra coverage tests
  it('kindForMime throws for disallowed mime', () => {
    expect(() => kindForMime('application/zip')).toThrow();
  });

  it('extForMime throws for disallowed mime', () => {
    expect(() => extForMime('application/zip')).toThrow();
  });

  it('MIME_ALLOWLIST has all expected mimes with correct kinds', () => {
    expect(MIME_ALLOWLIST['image/png'].kind).toBe('IMAGE');
    expect(MIME_ALLOWLIST['image/jpeg'].kind).toBe('IMAGE');
    expect(MIME_ALLOWLIST['image/webp'].kind).toBe('IMAGE');
    expect(MIME_ALLOWLIST['image/gif'].kind).toBe('IMAGE');
    expect(MIME_ALLOWLIST['image/avif'].kind).toBe('IMAGE');
    expect(MIME_ALLOWLIST['image/svg+xml'].kind).toBe('SVG');
    expect(MIME_ALLOWLIST['video/mp4'].kind).toBe('VIDEO');
    expect(MIME_ALLOWLIST['video/webm'].kind).toBe('VIDEO');
  });

  it('MIME_ALLOWLIST SVG has smaller cap than images', () => {
    expect(MIME_ALLOWLIST['image/svg+xml'].maxBytes).toBeLessThan(
      MIME_ALLOWLIST['image/png'].maxBytes,
    );
  });

  it('slugify handles empty result fallback', () => {
    expect(slugify('')).toBe('asset');
    expect(slugify('   ')).toBe('asset');
  });

  it('keyFor uses exactly 32 chars of sha256', () => {
    const sha = '0123456789abcdef'.repeat(4); // 64 chars
    const key = keyFor(sha, 'test-file', 'jpg');
    const parts = key.split('/');
    expect(parts[0]).toBe('originals');
    expect(parts[1]).toBe(sha.slice(0, 32));
    expect(parts[2]).toBe('test-file.jpg');
  });
});
