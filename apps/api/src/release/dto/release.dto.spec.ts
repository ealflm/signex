import { publishSchema, rollbackSchema } from './release.dto';

describe('release DTOs', () => {
  it('publishSchema requires themeId + numeric expectedDraftRevision and allows optional note', () => {
    expect(
      publishSchema.parse({ themeId: 'ctheme1', expectedDraftRevision: 5 }),
    ).toEqual({ themeId: 'ctheme1', expectedDraftRevision: 5 });
    expect(
      publishSchema.parse({
        themeId: 'ctheme1',
        expectedDraftRevision: 5,
        note: 'launch',
      }),
    ).toEqual({ themeId: 'ctheme1', expectedDraftRevision: 5, note: 'launch' });

    expect(() => publishSchema.parse({})).toThrow();
    expect(() => publishSchema.parse({ themeId: 'ctheme1' })).toThrow();
    expect(() =>
      publishSchema.parse({ themeId: 'ctheme1', expectedDraftRevision: -1 }),
    ).toThrow();
    expect(() =>
      publishSchema.parse({ themeId: 'ctheme1', expectedDraftRevision: 'x' }),
    ).toThrow();
  });

  it('rollbackSchema requires a positive toVersion', () => {
    expect(rollbackSchema.parse({ toVersion: 3 })).toEqual({ toVersion: 3 });
    expect(() => rollbackSchema.parse({})).toThrow();
    expect(() => rollbackSchema.parse({ toVersion: 0 })).toThrow();
  });
});
