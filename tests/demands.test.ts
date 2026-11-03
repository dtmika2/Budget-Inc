import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { createBot, runToEnd } from '../src/core/bots';
import { presetSliders } from '../src/core/budgetVote';
import { conditionFeasible, spawnDemand } from '../src/core/demands';
import { drawHand } from '../src/core/draft';
import { Rng } from '../src/core/rng';
import { comparableState, replay } from '../src/core/replay';
import type { Simulation } from '../src/core/simulation';
import type { DemandTemplate, OpenDemand } from '../src/core/types';
import { loadGameData } from '../src/data/loader';
import { readDataFiles, readLocale } from '../scripts/lib/nodeData';
import { advanceQuiet, cfgWith, gameData, makeSim, quietSim, resolveModal } from './helpers';

const fixed = (v: number) => ({ min: v, max: v });

/** A sim with one custom demand template (fixed ranges) and the demand open in `region`. */
function withDemand(tpl: Partial<DemandTemplate>, region = 'CZ041', seed = 'dem'): { sim: Simulation; demand: OpenDemand } {
  const sim = quietSim({ seed });
  const full: DemandTemplate = {
    id: 'test_demand',
    status: 'DUMMY',
    requesterTypes: ['interestGroup'],
    parties: [],
    interestGroups: ['pensioners'],
    regionWeights: {},
    regions: [],
    text: 'demand.dummy_demand_pensions.text',
    fulfilHint: 'demand.dummy_demand_pensions.hint',
    fulfil: [{ type: 'policy', tags: ['social'] }],
    onAccept: { regions: { self: fixed(1) } },
    onFulfil: { regions: { self: fixed(4) }, anger: { pensioners: fixed(-5) } },
    onFail: { regions: { self: fixed(-6) } },
    onReject: { regions: { self: fixed(-4) } },
    ...tpl,
  };
  (sim.data as { demands: DemandTemplate[] }).demands = [...gameData().demands.filter((d) => d.id !== full.id), full];
  const demand: OpenDemand = { id: 'demT', templateId: full.id, region, requester: { type: 'interestGroup', id: 'pensioners' }, spawnAbsDay: sim.absDay, expireAbsDay: sim.absDay + 30 };
  sim.state.demands.push(demand);
  sim.state.schedule.push({ seq: 9999, kind: 'demandExpire', absDay: demand.expireAbsDay, payload: { demandId: 'demT' } });
  return { sim, demand };
}

function restoreDemands(sim: Simulation) {
  (sim.data as { demands: DemandTemplate[] }).demands = gameData().demands.filter((d) => d.id !== 'test_demand');
}

describe('demand data', () => {
  const load = (mut: (d: Record<string, unknown>[]) => void, opts = {}) => {
    const files = readDataFiles();
    const ds = JSON.parse(JSON.stringify(files['data/demands/dummy.json'])) as Record<string, unknown>[];
    mut(ds);
    return loadGameData({ ...files, 'data/demands/dummy.json': ds }, readLocale(), opts);
  };

  it('a non-DUMMY party demand needs a programmeRef from one of its parties', () => {
    const a = load((ds) => (ds[0].status = 'APPROVED'));
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.errors.some((e) => e.code === 'badDemand' && e.path.endsWith('programmeRef'))).toBe(true);
    const b = load((ds) => {
      ds[0].status = 'APPROVED';
      ds[0].programmeRef = { party: 'ods', file: 'x.pdf' };
    });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.errors.some((e) => e.code === 'badDemand' && e.path.endsWith('programmeRef.party'))).toBe(true);
  });

  it('DRAFT demands load only with includeDevFiller', () => {
    const mut = (ds: Record<string, unknown>[]) => {
      ds[0].status = 'DRAFT';
      ds[0].programmeRef = { party: 'ano', file: 'x.pdf' };
    };
    const off = load(mut, { includeDevFiller: false });
    const on = load(mut, { includeDevFiller: true });
    expect(off.ok && on.ok).toBe(true);
    if (off.ok && on.ok) {
      expect(off.data.demands.some((d) => d.id === 'dummy_demand_parking')).toBe(false);
      expect(on.data.demands.some((d) => d.id === 'dummy_demand_parking')).toBe(true);
    }
  });

  it('unknown budget items, card tags and parties in demands are load errors', () => {
    const a = load((ds) => (ds[0].fulfil = [{ type: 'budget', item: 'nope', minSteps: 1 }]));
    expect(a.ok).toBe(false);
    const b = load((ds) => (ds[1].fulfil = [{ type: 'policy', tags: ['tourism'] }])); // no policy card has this tag
    expect(b.ok).toBe(false);
    const c = load((ds) => (ds[0].parties = ['nope']));
    expect(c.ok).toBe(false);
  });

  it('every programmeRef points to a file in sources/programmes', () => {
    for (const d of gameData().demands) {
      if (!d.programmeRef) continue;
      expect(existsSync(`sources/programmes/${d.programmeRef.party}/${d.programmeRef.file}`)).toBe(true);
    }
    expect(readFileSync('sources/programmes/README.md', 'utf8')).toContain('programmeRef');
  });

  it('the PC bubble no longer shows "!"; the demand pin does', () => {
    expect(readFileSync('src/ui/map/OpportunityPin.tsx', 'utf8')).not.toMatch(/>\s*!\s*</);
    expect(readFileSync('src/ui/map/DemandPin.tsx', 'utf8')).toMatch(/>\s*!\s*</);
  });
});

describe('spawning', () => {
  it('is deterministic and leaves the other RNG streams alone', () => {
    const run = (perYear: number) => {
      const cfg = cfgWith((c) => (c.demands.perYear = perYear));
      const sim = makeSim({ seed: 'spawn' }, cfg);
      const keep = (k: string) => k === 'budgetVote' || k === 'demandSpawn' || k === 'demandExpire';
      for (let days = 0; days < 300 && !sim.isOver; ) {
        if (sim.state.phase !== 'running') resolveModal(sim);
        else {
          sim.state.schedule = sim.state.schedule.filter((e) => keep(e.kind));
          sim.tick();
          days++;
        }
      }
      return sim;
    };
    const a = run(3);
    const b = run(3);
    const none = run(0);
    expect(a.state.log.filter((e) => e.type === 'demand_spawned')).toEqual(b.state.log.filter((e) => e.type === 'demand_spawned'));
    expect(a.state.log.some((e) => e.type === 'demand_spawned')).toBe(true);
    for (const stream of ['draft', 'chaos', 'opportunities', 'regions'] as const) expect(a.rng[stream].getState()).toEqual(none.rng[stream].getState());
  });

  it('never exceeds maxOpen and never puts two demands or pledges in one region', () => {
    const cfg = cfgWith((c) => (c.demands.perYear = 30));
    const sim = quietSim({ seed: 'busy' }, cfg);
    for (let i = 0; i < 40; i++) {
      spawnDemand(sim);
      expect(sim.state.demands.length).toBeLessThanOrEqual(cfg.demands.maxOpen);
      const regions = [...sim.state.demands.map((d) => d.region), ...sim.state.pledges.map((p) => p.region)];
      expect(new Set(regions).size).toBe(regions.length);
      if (sim.state.demands.length) sim.dispatch({ kind: 'acceptDemand', demandId: sim.state.demands[0].id });
    }
  });

  it('a budget-only condition is infeasible when no budget vote falls inside the window', () => {
    const sim = quietSim();
    const c = { type: 'budget' as const, item: 'transport', minSteps: 1 };
    const voteAbs = sim.absDayOf(5, config.budgetVote.day);
    expect(conditionFeasible(sim, c, 'CZ041', voteAbs - 10, voteAbs + 10)).toBe(true);
    expect(conditionFeasible(sim, c, 'CZ041', voteAbs + 1, voteAbs + 200)).toBe(false);
  });
});

describe('answering a demand', () => {
  it('accept applies onAccept, creates a pledge with a one-year deadline and removes the pin', () => {
    const { sim, demand } = withDemand({});
    const before = sim.state.regionShift.CZ041;
    expect(sim.dispatch({ kind: 'acceptDemand', demandId: demand.id }).ok).toBe(true);
    expect(sim.state.regionShift.CZ041 - before).toBeCloseTo(1);
    expect(sim.state.demands).toHaveLength(0);
    expect(sim.state.schedule.some((e) => e.kind === 'demandExpire')).toBe(false);
    expect(sim.state.pledges[0].deadlineAbsDay - sim.absDay).toBe(config.demands.deadlineQuarters * config.time.daysPerQuarter);
    restoreDemands(sim);
  });

  it('reject applies onReject; an ignored demand applies onReject x ignoreFactor', () => {
    const r = withDemand({}, 'CZ041', 'rej');
    const b0 = r.sim.state.regionShift.CZ041;
    r.sim.dispatch({ kind: 'rejectDemand', demandId: r.demand.id });
    expect(r.sim.state.regionShift.CZ041 - b0).toBeCloseTo(-4);
    restoreDemands(r.sim);

    const g = withDemand({}, 'CZ041', 'ign');
    const b1 = g.sim.state.regionShift.CZ041;
    advanceQuiet(g.sim, 31);
    const e = g.sim.state.log.find((l) => l.type === 'demand_ignored')!;
    expect(e).toBeDefined();
    expect(e.deltas!.regions!.CZ041).toBeCloseTo(-4 * config.demands.ignoreFactor);
    void b1;
    restoreDemands(g.sim);
  });

  it('the demand preview equals what is applied', () => {
    const { sim, demand } = withDemand({});
    const p = sim.previewDemand('test_demand', 'CZ041');
    const before = sim.state.regionShift.CZ041;
    sim.dispatch({ kind: 'rejectDemand', demandId: demand.id });
    expect(sim.state.regionShift.CZ041 - before).toBeCloseTo(p.reject.regions.CZ041!.min);
    expect(p.fulfil.anger.pensioners!.min).toBeLessThan(0);
    restoreDemands(sim);
  });
});

describe('fulfilling a pledge', () => {
  const accepted = (tpl: Partial<DemandTemplate>, seed: string) => {
    const r = withDemand(tpl, 'CZ041', seed);
    r.sim.dispatch({ kind: 'acceptDemand', demandId: r.demand.id });
    return r.sim;
  };

  it('a policy card with a matching tag fulfils it; others do not', () => {
    const sim = accepted({ fulfil: [{ type: 'policy', tags: ['social'] }] }, 'f-pol');
    const tagged = sim.cards.find((c) => c.tags?.includes('social'))!;
    const other = sim.cards.find((c) => !c.tags?.length)!;
    sim.state.phase = 'draft';
    sim.state.draft = { hand: [other.id, tagged.id], shownThisQuarter: [], rerolls: 0 };
    sim.dispatch({ kind: 'pickPolicy', cardId: other.id });
    expect(sim.state.pledges).toHaveLength(1);
    sim.state.phase = 'draft';
    sim.state.draft = { hand: [tagged.id], shownThisQuarter: [], rerolls: 0 };
    sim.dispatch({ kind: 'pickPolicy', cardId: tagged.id });
    expect(sim.state.pledges).toHaveLength(0);
    expect(sim.state.log.find((l) => l.type === 'pledge_fulfilled')!.by).toEqual({ type: 'policy', cardId: tagged.id });
    restoreDemands(sim);
  });

  it('a specific card id fulfils it', () => {
    const sim = accepted({ fulfil: [{ type: 'policy', cardIds: ['dummy_revenue'] }] }, 'f-id');
    sim.state.phase = 'draft';
    sim.state.draft = { hand: ['dummy_revenue'], shownThisQuarter: [], rerolls: 0 };
    sim.dispatch({ kind: 'pickPolicy', cardId: 'dummy_revenue' });
    expect(sim.state.pledges).toHaveLength(0);
    restoreDemands(sim);
  });

  it('a compromise that helps the region enough fulfils it', () => {
    const sim = accepted({ fulfil: [{ type: 'compromise', region: 'self', minRegionGain: 2 }] }, 'f-comp');
    const card = sim.compromiseById.get('dummy_comp_regions')!;
    const saved = card.regions;
    card.regions = { CZ041: fixed(5), CZ080: fixed(-3) };
    try {
      sim.state.compromiseOffer = ['dummy_comp_regions', 'dummy_comp_oligarchs'];
      sim.state.phase = 'compromise';
      sim.dispatch({ kind: 'makeCompromise', cardId: 'dummy_comp_regions', channelId: 'press', score: 0.5 });
      expect(sim.state.pledges).toHaveLength(0);
    } finally {
      card.regions = saved;
      restoreDemands(sim);
    }
  });

  it('a passed budget vote with the slider far enough fulfils it; a failed vote does not', () => {
    for (const pass of [true, false]) {
      const r = withDemand({ fulfil: [{ type: 'budget', item: 'transport', minSteps: 1 }] }, 'CZ041', `f-bud-${pass}`);
      const cfg = r.sim.cfg as { budgetVote: { passMin: number; passMax: number } };
      const saved = { ...cfg.budgetVote };
      cfg.budgetVote.passMin = pass ? 1 : 0;
      cfg.budgetVote.passMax = pass ? 1 : 0;
      try {
        r.sim.dispatch({ kind: 'acceptDemand', demandId: r.demand.id });
        r.sim.state.day = 74;
        while (r.sim.state.phase === 'running') r.sim.tick();
        const sliders = { ...presetSliders(r.sim, null), transport: 1 };
        r.sim.dispatch({ kind: 'voteBudget', sliders, presetId: null });
        expect(r.sim.state.pledges.length).toBe(pass ? 0 : 1);
      } finally {
        cfg.budgetVote.passMin = saved.passMin;
        cfg.budgetVote.passMax = saved.passMax;
        restoreDemands(r.sim);
      }
    }
  });

  it('fails exactly once after the deadline, and cannot be fulfilled afterwards', () => {
    const sim = accepted({}, 'f-dead');
    const pledge = sim.state.pledges[0];
    sim.state.schedule = sim.state.schedule.filter((e) => e.kind !== 'budgetVote');
    advanceQuiet(sim, pledge.deadlineAbsDay - sim.absDay + 3);
    const fails = sim.state.log.filter((l) => l.type === 'pledge_failed');
    expect(fails).toHaveLength(1);
    expect(fails[0].deltas!.regions!.CZ041).toBeCloseTo(-6);
    expect(sim.state.pledges).toHaveLength(0);
    expect(sim.state.log.some((l) => l.type === 'pledge_fulfilled')).toBe(false);
    restoreDemands(sim);
  });

  it('matching cards get extra draft weight while a pledge is active', () => {
    const sim = makeSim({ seed: 'boost' });
    const target = sim.cards.find((c) => c.tags?.includes('social'))!;
    const freq = (boost?: (c: { id: string }) => number) => {
      let n = 0;
      for (let i = 0; i < 3000; i++) {
        const { hand } = drawHand(
          { cards: sim.cards, weights: sim.leaderDef.leaningWeights, picked: [], shownThisQuarter: [], quarter: 1, repeatCooldownQuarters: 4, handSize: 3, boost },
          new Rng(`b${i}`),
        );
        if (hand.includes(target.id)) n++;
      }
      return n / 3000;
    };
    const plain = freq();
    const boosted = freq((c) => (c.id === target.id ? config.demands.draftBoost : 1));
    expect(boosted).toBeGreaterThan(plain * 1.4);
  });
});

describe('bots and replay with demands', () => {
  it('random and greedy runs answer demands and replay to the same final state', () => {
    for (const kind of ['random', 'greedy'] as const) {
      const sim = makeSim({ seed: `dm-${kind}` });
      runToEnd(sim, createBot(kind, `dm-${kind}`));
      expect(sim.state.log.some((l) => l.type === 'demand_accepted' || l.type === 'demand_rejected')).toBe(true);
      const again = replay(gameData(), config, { seed: sim.state.seed, leader: sim.state.leader, difficulty: sim.state.difficulty, inputs: sim.state.inputs });
      expect(comparableState(again.state)).toEqual(comparableState(sim.state));
    }
  });
});
