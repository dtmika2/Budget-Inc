import { describe, expect, it } from 'vitest';
import { canBuy, isForkLink, nodeStatus, treesFor } from '../src/core/upgrades';
import { loadGameData } from '../src/data/loader';
import { readDataFiles, readLocale } from '../scripts/lib/nodeData';
import { quietSim } from './helpers';

const TREE = 'data/upgrades/compass.json';
type AnyObj = Record<string, unknown> & { start: Record<string, string>; nodes: { id: string; links: string[] }[] };

function compass(sim: ReturnType<typeof quietSim>) {
  return treesFor(sim).find((t) => t.id === 'compass')!;
}

function loadWith(patch: (tree: AnyObj) => void) {
  const files = readDataFiles();
  const tree = structuredClone(files[TREE]) as AnyObj;
  patch(tree);
  return loadGameData({ ...files, [TREE]: tree }, readLocale());
}

describe('political compass tree', () => {
  it('each leader starts on their own box, with its effect active', () => {
    const mupka = quietSim({ leader: 'mupka' });
    const abis = quietSim({ leader: 'abis' });
    const mStart = compass(mupka).start.mupka!;
    const aStart = compass(abis).start.abis!;
    expect(mStart).not.toBe(aStart);
    expect(mupka.state.ownedUpgrades).toEqual([mStart]);
    expect(abis.state.ownedUpgrades).toEqual([aStart]);
    expect(mupka.state.modifiers.some((m) => m.origin === `upgrade:${mStart}`)).toBe(true);
    expect(mupka.state.log.some((e) => e.type === 'upgrade_bought')).toBe(false);
  });

  it('only boxes next to an owned box can be bought', () => {
    const sim = quietSim({ leader: 'mupka' });
    sim.state.pc = 100;
    const tree = compass(sim);
    const start = tree.start.mupka!;
    for (const n of tree.nodes) {
      if (n.id === start) continue;
      const touching = n.links.includes(start) || tree.nodes.find((x) => x.id === start)!.links.includes(n.id);
      expect(nodeStatus(sim.state.ownedUpgrades, n, tree), n.id).toBe(touching ? 'available' : 'locked');
    }
  });

  it('a fork choice locks the other branch out for good', () => {
    const sim = quietSim({ leader: 'mupka' });
    sim.state.pc = 100;
    const tree = compass(sim);
    for (const [a, b] of tree.exclusive) {
      sim.state.ownedUpgrades = [tree.start.mupka!];
      // own a path up to the fork: every node linked to a or b
      for (const n of tree.nodes) if (n.links.includes(a) || n.links.includes(b)) sim.state.ownedUpgrades.push(n.id);
      expect(canBuy(sim, a), a).toBeNull();
      expect(canBuy(sim, b), b).toBeNull();
      expect(sim.dispatch({ kind: 'buyUpgrade', nodeId: a }).ok).toBe(true);
      expect(nodeStatus(sim.state.ownedUpgrades, tree.nodes.find((n) => n.id === b)!, tree)).toBe('excluded');
      expect(sim.dispatch({ kind: 'buyUpgrade', nodeId: b }).ok).toBe(false);
    }
  });

  it('every fork branch link is marked with a lock, other links are not', () => {
    const sim = quietSim({ leader: 'mupka' });
    const tree = compass(sim);
    let forks = 0;
    for (const n of tree.nodes) for (const l of n.links) if (isForkLink(tree, n.id, l)) forks++;
    expect(forks).toBe(tree.exclusive.length * 2);
  });

  it('loads cleanly and every box has its texts', () => {
    const locale = readLocale();
    const r = loadGameData(readDataFiles(), locale);
    expect(r.ok).toBe(true);
    if (r.ok) for (const t of r.data.upgrades) for (const n of t.nodes) expect(locale[n.name]).toBeDefined();
  });

  it('rejects a leader without a start box, an unknown link and an unknown start leader', () => {
    const codes = (r: ReturnType<typeof loadGameData>) => (r.ok ? [] : r.errors.map((e) => e.code));
    expect(codes(loadWith((t) => delete t.start.abis))).toContain('missingStart');
    expect(codes(loadWith((t) => t.nodes[0].links.push('nope')))).toContain('unknownUpgrade');
    expect(codes(loadWith((t) => (t.start.nope = t.nodes[0].id)))).toContain('unknownLeader');
  });
});
