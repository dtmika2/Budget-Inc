import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CZECH = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('no Czech strings in src/', () => {
  it('contains no Czech diacritics in any source file', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (CZECH.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('budget chapter names are never shown to the player', () => {
  it('no UI file reads chapter names; the debug overlay shows codes only', () => {
    const budget = JSON.parse(readFileSync('data/budget.json', 'utf8')) as { chapters: { name: string }[] };
    const locale = readFileSync('locales/cs.json', 'utf8');
    for (const c of budget.chapters) expect(locale.includes(c.name)).toBe(false);
    for (const file of walk('src/ui')) {
      const src = readFileSync(file, 'utf8');
      if (!src.includes('chapters')) continue;
      expect(src).not.toMatch(/\.name\b/);
    }
  });
});
