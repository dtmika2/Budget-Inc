import { describe, expect, it } from 'vitest';
import { canBuy, isForkLink, nodeStatus, treesFor, upgradeCooldownLeft } from '../src/core/upgrades';
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

  it('each střed box needs both of its 3B boxes', () => {
    const sim = quietSim({ leader: 'mupka' });
    sim.state.pc = 100;
    const tree = compass(sim);
    for (const side of ['l', 'r']) {
      const mid = tree.nodes.find((n) => n.id === `c_${side}4m`)!;
      expect(mid.requires).toHaveLength(2);
      sim.state.ownedUpgrades = [tree.start.mupka!, mid.requires[0]];
      expect(nodeStatus(sim.state.ownedUpgrades, mid, tree)).toBe('locked');
      sim.state.ownedUpgrades.push(mid.requires[1]);
      expect(nodeStatus(sim.state.ownedUpgrades, mid, tree)).toBe('available');
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

describe('active abilities (P29)', () => {
  const owner = (id: string) => {
    const sim = quietSim({ seed: `act-${id}` });
    sim.state.ownedUpgrades.push(id);
    sim.state.pc = 5;
    return sim;
  };

  it('every tree has active boxes with a cooldown; their texts load', () => {
    const sim = quietSim();
    const actives = sim.data.upgrades.flatMap((tr) => tr.nodes).filter((n) => n.active);
    expect(actives.length).toBeGreaterThanOrEqual(5);
    for (const n of actives) expect(n.active!.cooldownDays).toBeGreaterThan(0);
  });

  it('a region ability needs a kraj, raises it, then cools down', () => {
    const id = quietSim().data.upgrades.flatMap((tr) => tr.nodes).find((n) => n.active?.target === 'region')!.id;
    const sim = owner(id);
    expect(sim.dispatch({ kind: 'useUpgradeAction', nodeId: id }).ok).toBe(false);
    const kraj = sim.data.regions.regions[0].code;
    const p = sim.previewUpgradeAction(id, kraj);
    const s0 = sim.state.regionShift[kraj];
    expect(sim.dispatch({ kind: 'useUpgradeAction', nodeId: id, target: kraj }).ok).toBe(true);
    const d = sim.state.regionShift[kraj] - s0;
    expect(d).toBeGreaterThanOrEqual(p.regions[kraj]!.min - 1e-9);
    expect(sim.dispatch({ kind: 'useUpgradeAction', nodeId: id, target: kraj }).ok).toBe(false);
    expect(upgradeCooldownLeft(sim, id)).toBeGreaterThan(0);
  });

  it('a group ability calms the chosen group; only owned boxes can be used', () => {
    const id = quietSim().data.upgrades.flatMap((tr) => tr.nodes).find((n) => n.active?.target === 'group')!.id;
    expect(quietSim().dispatch({ kind: 'useUpgradeAction', nodeId: id, target: 'eu' }).ok).toBe(false);
    const sim = owner(id);
    sim.state.anger.eu = 70;
    expect(sim.dispatch({ kind: 'useUpgradeAction', nodeId: id, target: 'eu' }).ok).toBe(true);
    expect(sim.state.anger.eu).toBeLessThan(70);
    expect(sim.state.log.some((l) => l.type === 'upgrade_action' && l.target === 'eu')).toBe(true);
  });
});
