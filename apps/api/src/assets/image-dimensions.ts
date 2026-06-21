export interface Dimensions {
  width: number;
  height: number;
}

function readPng(buf: Buffer): Dimensions | null {
  // PNG signature + IHDR (width @16, height @20, big-endian)
  if (buf.length < 24) return null;
  const sig = buf.subarray(0, 8).toString('latin1');
  if (sig !== '\x89PNG\r\n\x1a\n') return null;
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readGif(buf: Buffer): Dimensions | null {
  if (buf.length < 10) return null;
  const sig = buf.subarray(0, 6).toString('ascii');
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

function readJpeg(buf: Buffer): Dimensions | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) {
      off++;
      continue;
    }
    const marker = buf[off + 1];
    // SOF0..SOF15 except DHT(c4)/DAC(cc)/RSTn carry frame dims
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = buf.readUInt16BE(off + 5);
      const width = buf.readUInt16BE(off + 7);
      return { width, height };
    }
    const segLen = buf.readUInt16BE(off + 2);
    off += 2 + segLen;
  }
  return null;
}

function readWebp(buf: Buffer): Dimensions | null {
  if (buf.length < 30) return null;
  if (buf.subarray(0, 4).toString('ascii') !== 'RIFF') return null;
  if (buf.subarray(8, 12).toString('ascii') !== 'WEBP') return null;
  const fmt = buf.subarray(12, 16).toString('ascii');
  if (fmt === 'VP8X') {
    return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  }
  if (fmt === 'VP8 ') {
    // lossy: dims at offset 26/28 (14-bit, mask high 2 bits)
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (fmt === 'VP8L') {
    const b0 = buf[21];
    const b1 = buf[22];
    const b2 = buf[23];
    const b3 = buf[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }
  return null;
}

function readSvg(buf: Buffer): Dimensions | null {
  const text = buf.toString('utf8', 0, Math.min(buf.length, 4096));
  const w = /\bwidth\s*=\s*["']?\s*([\d.]+)/i.exec(text);
  const h = /\bheight\s*=\s*["']?\s*([\d.]+)/i.exec(text);
  if (w && h) {
    return { width: Math.round(Number(w[1])), height: Math.round(Number(h[1])) };
  }
  const vb = /\bviewBox\s*=\s*["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/i.exec(text);
  if (vb) {
    return { width: Math.round(Number(vb[1])), height: Math.round(Number(vb[2])) };
  }
  return null;
}

function isAvifBrand(buf: Buffer): boolean {
  // ISOBMFF ftyp box: bytes 4..7 == 'ftyp', then major brand at 8..11 and
  // compatible brands at 12+ (4 bytes each). Brands that indicate AVIF/HEIF.
  if (buf.length < 12) return false;
  if (buf.subarray(4, 8).toString('ascii') !== 'ftyp') return false;
  const avifBrands = new Set(['avif', 'avis', 'mif1', 'heic', 'heix', 'msf1']);
  // Major brand
  if (avifBrands.has(buf.subarray(8, 12).toString('ascii'))) return true;
  // Compatible brands (each 4 bytes starting at offset 16)
  for (let off = 16; off + 4 <= buf.length; off += 4) {
    if (avifBrands.has(buf.subarray(off, off + 4).toString('ascii'))) return true;
  }
  return false;
}

function readAvif(buf: Buffer): Dimensions | null {
  // Scan buffer for the 'ispe' FullBox (ImageSpatialExtentsProperty).
  // Layout: [4B box-size][4B 'ispe'][1B version][3B flags][4B width BE][4B height BE]
  // We search for the ASCII marker 'ispe' and then read width/height after the
  // 4-byte version+flags field.
  const marker = Buffer.from('ispe');
  let searchFrom = 0;
  while (searchFrom < buf.length) {
    const idx = buf.indexOf(marker, searchFrom);
    if (idx === -1) break;
    // Need 4 bytes version/flags + 4 bytes width + 4 bytes height after the marker
    if (idx + 4 + 4 + 4 <= buf.length) {
      const width = buf.readUInt32BE(idx + 4 + 4);
      const height = buf.readUInt32BE(idx + 4 + 8);
      if (width > 0 && height > 0) {
        return { width, height };
      }
    }
    searchFrom = idx + 1;
  }
  return null;
}

export function readImageDimensions(buf: Buffer, mime: string): Dimensions | null {
  switch (mime) {
    case 'image/png':
      return readPng(buf);
    case 'image/gif':
      return readGif(buf);
    case 'image/jpeg':
      return readJpeg(buf);
    case 'image/webp':
      return readWebp(buf);
    case 'image/svg+xml':
      return readSvg(buf);
    case 'image/avif':
    case 'image/heic':
    case 'image/heif':
      return isAvifBrand(buf) ? readAvif(buf) : null;
    default:
      return null;
  }
}
