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
    default:
      return null;
  }
}
