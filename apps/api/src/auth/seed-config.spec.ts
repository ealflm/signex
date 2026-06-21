import { SYSTEM_USER_ID, readSeedAdminConfig } from './seed-config';

describe('seed-config', () => {
  describe('SYSTEM_USER_ID', () => {
    it('is a stable, cuid-shaped 25-char lowercase id', () => {
      expect(SYSTEM_USER_ID).toBe('seedsystemadmin0000000000');
      expect(SYSTEM_USER_ID).toHaveLength(25);
      expect(SYSTEM_USER_ID).toMatch(/^[a-z][a-z0-9]{24}$/);
    });
  });

  describe('readSeedAdminConfig', () => {
    const ok = {
      SEED_ADMIN_EMAIL: 'admin@signex.test',
      SEED_ADMIN_NAME: 'System Admin',
      SEED_ADMIN_PASSWORD: 'change-me-please',
    };

    it('returns a typed config from SEED_ADMIN_* env', () => {
      expect(readSeedAdminConfig(ok)).toEqual({
        email: 'admin@signex.test',
        name: 'System Admin',
        password: 'change-me-please',
      });
    });

    it('trims surrounding whitespace on email and name', () => {
      const cfg = readSeedAdminConfig({
        ...ok,
        SEED_ADMIN_EMAIL: '  admin@signex.test  ',
        SEED_ADMIN_NAME: '  System Admin  ',
      });
      expect(cfg.email).toBe('admin@signex.test');
      expect(cfg.name).toBe('System Admin');
    });

    it('throws when SEED_ADMIN_EMAIL is missing', () => {
      const { SEED_ADMIN_EMAIL: _SEED_ADMIN_EMAIL, ...rest } = ok;
      expect(() => readSeedAdminConfig(rest)).toThrow(/SEED_ADMIN_EMAIL/);
    });

    it('throws when SEED_ADMIN_NAME is blank', () => {
      expect(() =>
        readSeedAdminConfig({ ...ok, SEED_ADMIN_NAME: '   ' }),
      ).toThrow(/SEED_ADMIN_NAME/);
    });

    it('throws when SEED_ADMIN_PASSWORD is shorter than 12 chars', () => {
      expect(() =>
        readSeedAdminConfig({ ...ok, SEED_ADMIN_PASSWORD: 'short' }),
      ).toThrow(/SEED_ADMIN_PASSWORD.*12/);
    });
  });
});
