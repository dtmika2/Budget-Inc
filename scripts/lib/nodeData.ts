/** Node adapter for the data loader (tests, simulator, scripts). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadGameData, type LoadOptions, type LoadResult } from '../../src/data/loader';
import type { GameData } from '../../src/core/types';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function readDataFiles(root = '.'): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of walk(join(root, 'data')).filter((p) => p.endsWith('.json'))) {
    out[relative(root, f).replace(/\\/g, '/')] = JSON.parse(readFileSync(f, 'utf8'));
  }
  return out;
}

/** Czech locale: locales/cs.json merged with locales/skilltree.cs.json (see src/i18n/locale.ts). */
export function readLocale(root = '.'): Record<string, string> {
  const main = JSON.parse(readFileSync(join(root, 'locales/cs.json'), 'utf8'));
  const tree = JSON.parse(readFileSync(join(root, 'locales/skilltree.cs.json'), 'utf8'));
  return { ...main, ...tree };
}

export function loadFromDisk(opts: LoadOptions = {}, root = '.'): LoadResult {
  return loadGameData(readDataFiles(root), readLocale(root), opts);
}

/** Load or throw with a readable message. */
export function mustLoad(opts: LoadOptions = {}): GameData {
  const r = loadFromDisk(opts);
  if (!r.ok) throw new Error('Invalid game data:\n' + r.errors.map((e) => `${e.code} ${e.file} ${e.path}: ${e.detail}`).join('\n'));
  return r.data;
}
