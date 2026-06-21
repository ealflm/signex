import { assertParity, ImporterParityError } from './parity';
import { lt, ltArray, twoTone } from './zip';
import { loadDicts } from './dict-source';

describe('assertParity', () => {
  it('passes for structurally identical objects', () => {
    const en = { a: 'x', b: ['1', '2'], c: { d: 'y' } };
    const vi = { a: 'X', b: ['a', 'b'], c: { d: 'Y' } };
    expect(() => assertParity(en, vi)).not.toThrow();
  });

  it('throws on a missing key, naming the path', () => {
    const en = { a: 'x', c: { d: 'y' } };
    const vi = { a: 'X', c: {} };
    expect(() => assertParity(en, vi)).toThrow(ImporterParityError);
    expect(() => assertParity(en, vi)).toThrow(/c\.d/);
  });

  it('throws on an array-length mismatch, naming the path', () => {
    const en = { items: ['1', '2', '3'] };
    const vi = { items: ['1', '2'] };
    expect(() => assertParity(en, vi)).toThrow(/items \(len 3 vs 2\)/);
  });

  it('recurses into arrays of objects', () => {
    const en = { cats: [{ items: ['a', 'b'] }] };
    const vi = { cats: [{ items: ['a'] }] };
    expect(() => assertParity(en, vi)).toThrow(/cats\.0\.items \(len 2 vs 1\)/);
  });
});

describe('zip helpers', () => {
  it('lt pairs en/vi strings', () => {
    expect(lt('Home', 'Trang chủ')).toEqual({ en: 'Home', vi: 'Trang chủ' });
  });
  it('ltArray pairs the two arrays', () => {
    expect(ltArray(['a', 'b'], ['x', 'y'])).toEqual({
      en: ['a', 'b'],
      vi: ['x', 'y'],
    });
  });
  it('twoTone splits lead/accent', () => {
    expect(twoTone('About ', 'Về ', 'SIGNEX', 'SIGNEX')).toEqual({
      lead: { en: 'About ', vi: 'Về ' },
      accent: { en: 'SIGNEX', vi: 'SIGNEX' },
    });
  });
});

describe('real dictionaries', () => {
  it('en/vi parity holds for the committed dicts', () => {
    const { en, vi } = loadDicts();
    expect(() => assertParity(en, vi)).not.toThrow();
  });
  it('has the 12 expected top keys', () => {
    const { en } = loadDicts();
    expect(Object.keys(en).sort()).toEqual(
      [
        'about',
        'aboutPage',
        'contact',
        'contactPage',
        'features',
        'footer',
        'form',
        'hero',
        'meta',
        'nav',
        'notFound',
        'products',
      ].sort(),
    );
  });
});
