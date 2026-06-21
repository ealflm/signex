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
});
