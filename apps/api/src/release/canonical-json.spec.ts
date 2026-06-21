import { canonicalJson } from './canonical-json';

describe('canonicalJson', () => {
  it('is independent of object key order', () => {
    const a = canonicalJson({ b: 1, a: 2, c: { y: 1, x: 2 } });
    const b = canonicalJson({ a: 2, c: { x: 2, y: 1 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":{"x":2,"y":1}}');
  });

  it('preserves array order and recurses into array elements', () => {
    expect(canonicalJson([{ b: 1, a: 2 }, { d: 4, c: 3 }])).toBe(
      '[{"a":2,"b":1},{"c":3,"d":4}]',
    );
  });

  it('serializes null and primitives', () => {
    expect(canonicalJson({ n: null, s: 'x', i: 3 })).toBe(
      '{"i":3,"n":null,"s":"x"}',
    );
  });

  it('throws on bigint (snapshots must not carry raw BigInt)', () => {
    expect(() => canonicalJson({ bytes: 10n })).toThrow(
      /bigint not allowed/i,
    );
  });
});
