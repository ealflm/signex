import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Cast to any: promisify(scrypt) typings only expose the 3-arg overload;
// the 4-arg (with options) form exists at runtime but needs an explicit cast.
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

// scrypt cost params (interactive-login tuned; pure-JS-free, no native dep).
const N = 16384; // CPU/memory cost
const R = 8; // block size
const P = 1; // parallelization
const KEYLEN = 64;
const SALT_BYTES = 16;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(plain, salt, KEYLEN, {
    N,
    r: R,
    p: P,
  })) as Buffer;
  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

export async function verifyPassword(
  plain: string,
  encoded: string,
): Promise<boolean> {
  try {
    const parts = encoded.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = (await scryptAsync(plain, salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    })) as Buffer;
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
