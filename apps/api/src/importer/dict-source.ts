import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type RawDict = Record<string, unknown>;

// The importer compiles to apps/api/dist/importer/. The web dicts live at a fixed
// committed relative path. We resolve from an explicit repoRoot (default = 4 levels up
// from this compiled file: dist/importer -> dist -> api -> apps -> repo) so the path is
// stable in both ts-jest (src) and the compiled dist runtime.
const DICT_DIR = join('apps', 'web', 'app', '[lang]', 'dictionaries');

export function resolveRepoRoot(): string {
  // From dist/importer/dist-source.js or src/importer/dict-source.ts -> up to repo root.
  // __dirname is .../apps/api/(src|dist)/importer ; repo root is 4 segments up.
  return resolve(__dirname, '..', '..', '..', '..');
}

export function loadDicts(repoRoot: string = resolveRepoRoot()): {
  en: RawDict;
  vi: RawDict;
} {
  const dir = join(repoRoot, DICT_DIR);
  const en = JSON.parse(readFileSync(join(dir, 'en.json'), 'utf8')) as RawDict;
  const vi = JSON.parse(readFileSync(join(dir, 'vi.json'), 'utf8')) as RawDict;
  return { en, vi };
}
