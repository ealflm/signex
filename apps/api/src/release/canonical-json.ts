/**
 * Stable JSON serialization for checksum computation.
 * Object keys are sorted recursively; array order is preserved.
 * Rejects bigint so a stray Asset.bytes BigInt can never reach a snapshot.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (typeof value === 'bigint') {
    throw new Error('canonicalJson: bigint not allowed in snapshot');
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => canonicalize(v));
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return out;
}
