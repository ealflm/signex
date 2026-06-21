import * as fs from 'fs';
import * as path from 'path';
import { readImageDimensions } from './image-dimensions';

// 1x1 transparent PNG (real bytes); width/height in IHDR at offset 16.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQGuAAAAAElFTkSuQmCC',
  'base64',
);

function gif(w: number, h: number): Buffer {
  const b = Buffer.from('GIF89a       ', 'latin1');
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return b;
}

function jpeg(w: number, h: number): Buffer {
  // SOI + SOF0 marker (FFC0), len=17, precision=8, height, width
  const sof = Buffer.alloc(19);
  sof[0] = 0xff; sof[1] = 0xd8; // SOI
  sof[2] = 0xff; sof[3] = 0xc0; // SOF0
  sof[4] = 0x00; sof[5] = 0x11; // length 17
  sof[6] = 0x08; // precision
  sof.writeUInt16BE(h, 7);
  sof.writeUInt16BE(w, 9);
  return sof;
}

function webpVp8x(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBP', 8, 'ascii');
  b.write('VP8X', 12, 'ascii');
  // canvas width-1 / height-1 are 24-bit LE at offsets 24 and 27
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
}

describe('readImageDimensions', () => {
  it('reads PNG IHDR', () => {
    expect(readImageDimensions(PNG_1x1, 'image/png')).toEqual({ width: 1, height: 1 });
  });
  it('reads GIF logical screen', () => {
    expect(readImageDimensions(gif(320, 240), 'image/gif')).toEqual({ width: 320, height: 240 });
  });
  it('reads JPEG SOF0', () => {
    expect(readImageDimensions(jpeg(640, 480), 'image/jpeg')).toEqual({ width: 640, height: 480 });
  });
  it('reads WebP VP8X', () => {
    expect(readImageDimensions(webpVp8x(800, 600), 'image/webp')).toEqual({ width: 800, height: 600 });
  });
  it('reads SVG width/height attrs', () => {
    const svg = Buffer.from('<svg width="48" height="24" xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(readImageDimensions(svg, 'image/svg+xml')).toEqual({ width: 48, height: 24 });
  });
  it('reads SVG viewBox when no width/height', () => {
    const svg = Buffer.from('<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(readImageDimensions(svg, 'image/svg+xml')).toEqual({ width: 100, height: 50 });
  });
  it('returns null for unknown bytes', () => {
    expect(readImageDimensions(Buffer.from('not an image'), 'image/png')).toBeNull();
  });

  describe('AVIF (ispe box parsing)', () => {
    // Real .avif from apps/web/public/assets/images/ — smallest file (16 021 B)
    // Binary inspection confirmed: ispe box at offset 188, width=480, height=640
    const avifPath = path.resolve(
      __dirname,
      '../../../../apps/web/public/assets/images/69a9a63112d835814c29e175_Tropical_Sunset_Relaxation__1_.avif',
    );

    it('reads real AVIF file dimensions (image/avif)', () => {
      const buf = fs.readFileSync(avifPath);
      const dims = readImageDimensions(buf, 'image/avif');
      expect(dims).toEqual({ width: 480, height: 640 });
    });

    it('returns null for non-AVIF buffer with image/avif mime', () => {
      expect(readImageDimensions(Buffer.from('not avif data at all'), 'image/avif')).toBeNull();
    });

    it('reads second real AVIF file (sanity check dims are positive)', () => {
      // 69ac6f71e2f6cf6c0843aa68 — binary confirmed: width=1280, height=1920
      const buf = fs.readFileSync(
        path.resolve(
          __dirname,
          '../../../../apps/web/public/assets/images/69ac6f71e2f6cf6c0843aa68_pexels-julia-volk-7292958.avif',
        ),
      );
      const dims = readImageDimensions(buf, 'image/avif');
      expect(dims).toEqual({ width: 1280, height: 1920 });
    });
  });
});
