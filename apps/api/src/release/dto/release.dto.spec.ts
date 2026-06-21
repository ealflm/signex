import { publishSchema, rollbackSchema } from './release.dto';

describe('release DTOs', () => {
  it('publishSchema requires a numeric expectedRevision and allows optional note', () => {
    expect(publishSchema.parse({ expectedRevision: 5 })).toEqual({
      expectedRevision: 5,
    });
    expect(
      publishSchema.parse({ expectedRevision: 5, note: 'launch' }),
    ).toEqual({ expectedRevision: 5, note: 'launch' });
    expect(() => publishSchema.parse({})).toThrow();
    expect(() =>
      publishSchema.parse({ expectedRevision: 'x' }),
    ).toThrow();
  });

  it('rollbackSchema requires toVersion and defaults restoreWorkingState to false', () => {
    expect(rollbackSchema.parse({ toVersion: 3 })).toEqual({
      toVersion: 3,
      restoreWorkingState: false,
    });
    expect(
      rollbackSchema.parse({ toVersion: 3, restoreWorkingState: true }),
    ).toEqual({ toVersion: 3, restoreWorkingState: true });
    expect(() => rollbackSchema.parse({})).toThrow();
  });
});
