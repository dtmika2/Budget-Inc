import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '../src/i18n';
import { CS as cs } from '../src/i18n/locale';
import main from '../locales/cs.json';
import skilltree from '../locales/skilltree.cs.json';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('i18n', () => {
  it('substitutes params', () => {
    expect(t('hud.date', { q: 3, y: 1, d: 14, m: 8 })).toBe('Q3 / rok 1 · 14. 8.');
  });

  it('renders a visible marker for a missing key', () => {
    expect(t('no.such.key')).toBe('⟦no.such.key⟧');
  });

  it('the skill tree locale and the main locale share no keys', () => {
    const dup = Object.keys(skilltree).filter((k) => k in main);
    expect(dup).toEqual([]);
  });

  it('every literal t("...") key used in src/ exists in the locale', () => {
    const missing: string[] = [];
    for (const f of walk('src').filter((p) => /\.(ts|tsx)$/.test(p))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        if (!(m[1] in cs)) missing.push(`${f}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
