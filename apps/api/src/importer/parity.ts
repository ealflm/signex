export class ImporterParityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImporterParityError';
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Recursive en/vi parity: identical key sets at every object node AND identical
 * array lengths at every array node. Strings/numbers/null leaves are not value-compared
 * (the two locales differ by design); only STRUCTURE is asserted.
 */
export function assertParity(en: unknown, vi: unknown, path = ''): void {
  if (Array.isArray(en) || Array.isArray(vi)) {
    if (!Array.isArray(en) || !Array.isArray(vi)) {
      throw new ImporterParityError(
        `${path || '<root>'}: one side is an array, the other is not`,
      );
    }
    if (en.length !== vi.length) {
      throw new ImporterParityError(
        `${path || '<root>'} (len ${en.length} vs ${vi.length})`,
      );
    }
    en.forEach((child, i) =>
      assertParity(child, vi[i], path ? `${path}.${i}` : String(i)),
    );
    return;
  }
  if (isPlainObject(en) || isPlainObject(vi)) {
    if (!isPlainObject(en) || !isPlainObject(vi)) {
      throw new ImporterParityError(
        `${path || '<root>'}: object/non-object mismatch`,
      );
    }
    const enKeys = Object.keys(en).sort();
    const viKeys = Object.keys(vi).sort();
    for (const k of enKeys) {
      if (!(k in vi)) throw new ImporterParityError(path ? `${path}.${k}` : k);
    }
    for (const k of viKeys) {
      if (!(k in en)) throw new ImporterParityError(path ? `${path}.${k}` : k);
    }
    for (const k of enKeys) {
      assertParity(en[k], vi[k], path ? `${path}.${k}` : k);
    }
    return;
  }
  // both leaves (string/number/boolean/null) — structurally fine.
}
