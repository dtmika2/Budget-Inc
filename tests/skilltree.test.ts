import { describe, expect, it } from 'vitest';
import { treesFor } from '../src/core/upgrades';
import { loadGameData } from '../src/data/loader';
import { readDataFiles, readLocale } from '../scripts/lib/nodeData';
import { quietSim } from './helpers';

describe('leader skill trees', () => {
  it('a leader tree is only available to its leader', () => {
    const abis = quietSim({ leader: 'abis' });
    const mupka = quietSim({ leader: 'mupka' });
    expect(treesFor(abis).map((t) => t.id)).toContain('abis');
    expect(treesFor(mupka).map((t) => t.id)).not.toContain('abis');
    expect(treesFor(mupka).map((t) => t.id)).toContain('support');
    abis.state.pc = 100;
    mupka.state.pc = 100;
    expect(abis.dispatch({ kind: 'buyUpgrade', nodeId: 'abis_own_media' }).ok).toBe(true);
    expect(mupka.validate({ kind: 'buyUpgrade', nodeId: 'abis_own_media' })).toBe('no such node');
  });

  it('an unknown leader on a tree is a load error', () => {
    const files = readDataFiles();
    const tree = { ...(files['data/upgrades/abis.json'] as object), leader: 'nope' };
    const r = loadGameData({ ...files, 'data/upgrades/abis.json': tree }, readLocale());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === 'unknownLeader' && e.file === 'data/upgrades/abis.json')).toBe(true);
  });

  it('skill tree texts come from locales/skilltree.cs.json', () => {
    const files = readDataFiles();
    const locale = readLocale();
    const r = loadGameData(files, locale);
    expect(r.ok).toBe(true);
    if (r.ok) for (const t of r.data.upgrades) for (const n of t.nodes) expect(locale[n.name]).toBeDefined();
  });
});
