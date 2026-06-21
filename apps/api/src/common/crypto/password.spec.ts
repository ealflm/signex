import { hashPassword, verifyPassword } from './password';

describe('password (scrypt)', () => {
  it('hashes to the encoded scrypt$ format and is salted (two hashes differ)', async () => {
    const a = await hashPassword('s3cret-pw');
    const b = await hashPassword('s3cret-pw');
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(a).not.toBe(b); // random salt
    expect(a.split('$')).toHaveLength(6);
  });

  it('verifies a correct password', async () => {
    const enc = await hashPassword('correct horse');
    await expect(verifyPassword('correct horse', enc)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const enc = await hashPassword('correct horse');
    await expect(verifyPassword('wrong horse', enc)).resolves.toBe(false);
  });

  it('returns false (does not throw) on a malformed encoded string', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', '')).resolves.toBe(false);
  });
});
