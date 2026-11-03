import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { applyPct, budgetTerm, computeFinances, initPct, totals } from '../src/core/budget';
import { createBot, runToEnd } from '../src/core/bots';
import { angerChange, budgetChangePct, combine, resourceChange, scalar, tickModifiers } from '../src/core/modifiers';
import { Rng, createStreams } from '../src/core/rng';
import type { Modifier } from '../src/core/types';
import { advanceQuiet, cfgWith, gameData, makeSim, quietSim } from './helpers';

describe('rng', () => {
  it('is reproducible for the same seed', () => {
    const a = new Rng('x');
    const b = new Rng('x');
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it('streams are independent: consuming one does not shift another', () => {
    const s1 = createStreams('seed');
    const s2 = createStreams('seed');
    for (let i = 0; i < 100; i++) s1.draft.next(); // extra rerolls
    expect(s1.chaos.next()).toBe(s2.chaos.next());
    expect(s1.effects.next()).toBe(s2.effects.next());
    expect(s1.draft.next()).not.toBe(s2.draft.next());
  });

  it('produces values in [0,1) with a sane mean', () => {
    const r = new Rng('mean');
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 20000).toBeCloseTo(0.5, 1);
  });
});

const mod = (m: Partial<Modifier> & Pick<Modifier, 'type' | 'target' | 'value'>): Modifier => ({ origin: 'test', ...m });

describe('modifier pipeline', () => {
  it('applies additives first, then multipliers', () => {
    expect(combine(-4, [mod({ type: 'multiplier', target: 'x', value: 0.5 }), mod({ type: 'add', target: 'x', value: 2 })])).toBe(-1);
  });

  it('applies the global negative multiplier only to bad changes, before modifiers', () => {
    const ctx = { modifiers: [mod({ type: 'add', target: 'support.loss', value: -1 })], negativeMultiplier: 2 };
    // roll -3 -> *2 = -6 -> + (-1) = -7
    expect(resourceChange(ctx, 'support', -3, 'policy')).toBe(-7);
    // good change: no negative multiplier, no loss modifier
    expect(resourceChange(ctx, 'support', 3, 'policy')).toBe(3);
    // anger: + is bad
    expect(angerChange({ modifiers: [], negativeMultiplier: 2 }, 'media', 4, 'policy')).toBe(8);
    expect(angerChange({ modifiers: [], negativeMultiplier: 2 }, 'media', -4, 'policy')).toBe(-4);
  });

  it('filters by source', () => {
    const ctx = { modifiers: [mod({ type: 'multiplier', target: 'support.loss', value: 0.7, source: 'chaos' })], negativeMultiplier: 1 };
    expect(resourceChange(ctx, 'support', -10, 'chaos')).toBeCloseTo(-7);
    expect(resourceChange(ctx, 'support', -10, 'policy')).toBe(-10);
  });

  it('drift matches <res>.drift and skips the global negative multiplier', () => {
    const ctx = { modifiers: [mod({ type: 'multiplier', target: 'support.drift', value: 0.7 })], negativeMultiplier: 5 };
    expect(resourceChange(ctx, 'support', -0.05, 'drift')).toBeCloseTo(-0.035);
  });

  it('timed modifiers expire after their days', () => {
    let mods: Modifier[] = [mod({ type: 'multiplier', target: 'x', value: 2, daysLeft: 2 }), mod({ type: 'add', target: 'y', value: 1 })];
    mods = tickModifiers(mods);
    expect(mods).toHaveLength(2);
    mods = tickModifiers(mods);
    expect(mods.map((m) => m.target)).toEqual(['y']);
  });

  it('finances.negative scales worsening budget changes and negative finance values only', () => {
    const ctx = { modifiers: [mod({ type: 'multiplier', target: 'finances.negative', value: 0.5 })], negativeMultiplier: 1 };
    expect(budgetChangePct(ctx, { type: 'expenditure', changePct: 4 }, 'policy')).toBe(2);
    expect(budgetChangePct(ctx, { type: 'revenue', changePct: -4 }, 'policy')).toBe(-2);
    expect(budgetChangePct(ctx, { type: 'revenue', changePct: 4 }, 'policy')).toBe(4);
    expect(budgetChangePct(ctx, { type: 'expenditure', changePct: -4 }, 'policy')).toBe(-4);
    expect(resourceChange(ctx, 'finances', -2, 'policy')).toBe(-1);
    expect(resourceChange(ctx, 'finances', 2, 'policy')).toBe(2);
  });

  it('scalar targets (election.T_base, pc.perQuarter)', () => {
    const ctx = { modifiers: [mod({ type: 'add', target: 'election.T_base', value: -3 })], negativeMultiplier: 1 };
    expect(scalar(ctx, 'election.T_base', 45)).toBe(42);
    expect(scalar(ctx, 'pc.perQuarter', 2)).toBe(2);
  });
});

describe('budget model', () => {
  const budget = gameData().budget;

  it('changePct is additive relative to the original value (no compounding)', () => {
    const pct = initPct(budget);
    applyPct(budget, pct, '313', 'expenditure', 10);
    applyPct(budget, pct, '313', 'expenditure', 10);
    const ch = totals(budget, pct).chapters.find((c) => c.code === '313')!;
    expect(ch.expenditure).toBeCloseTo(1050e9 * 1.2);
  });

  it('"*" applies to every chapter', () => {
    const pct = initPct(budget);
    applyPct(budget, pct, '*', 'expenditure', 2);
    expect(Object.values(pct.expPct).every((v) => v === 2)).toBe(true);
  });

  it('floors chapter values at 0', () => {
    const pct = initPct(budget);
    applyPct(budget, pct, '335', 'revenue', -250);
    expect(totals(budget, pct).chapters.find((c) => c.code === '335')!.revenue).toBe(0);
  });

  it('finances formula: F_start + scale*(bal_t - bal_0)/E_0*100 + extra + mods, clamped', () => {
    const pct = initPct(budget);
    const E0 = budget.chapters.reduce((s, c) => s + c.expenditure, 0);
    applyPct(budget, pct, '398', 'revenue', 1); // +16.5 bn
    const expected = 60 + (5 * 16.5e9 * 100) / E0 + 2 - 1;
    expect(computeFinances(budget, pct, 5, 60, 2, -1)).toBeCloseTo(expected);
    expect(budgetTerm(budget, pct, 5)).toBeCloseTo((5 * 16.5e9 * 100) / E0);
    applyPct(budget, pct, '398', 'revenue', 1000);
    expect(computeFinances(budget, pct, 5, 60, 0, 0)).toBe(100);
  });

  it('mandatory growth at the budget vote lowers Finances by about scale * pct', () => {
    const sim = quietSim();
    const before = sim.state.resources.finances;
    // tick to day 75 of Q1
    while (sim.state.phase === 'running') sim.tick();
    expect(sim.state.phase).toBe('budgetVote');
    expect(sim.state.day).toBe(config.budgetVote.day);
    const growth = sim.state.log.find((e) => e.type === 'mandatory_growth')!;
    expect(growth.changePct).toBe(2);
    expect(Object.values(sim.state.budget.expPct).every((v) => v >= 2)).toBe(true);
    expect(before - sim.state.resources.finances).toBeGreaterThan(9);
  });
});

describe('zero penalties', () => {
  it('starts at 0 and only ends at exitAt (hysteresis)', () => {
    const sim = quietSim();
    sim.state.resources.support = 0;
    sim.tick();
    expect(sim.state.zeroPenalties.support).toBe(true);
    expect(sim.state.log.some((e) => e.type === 'zero_penalty_started' && e.resource === 'support')).toBe(true);
    sim.state.resources.support = 2;
    sim.tick();
    expect(sim.state.zeroPenalties.support).toBe(true);
    sim.state.resources.support = 3.5;
    sim.tick();
    expect(sim.state.zeroPenalties.support).toBe(false);
    expect(sim.state.log.some((e) => e.type === 'zero_penalty_ended' && e.resource === 'support')).toBe(true);
  });

  it('street pressure drains coalition and angers activists', () => {
    const sim = quietSim();
    sim.state.resources.support = 0;
    sim.tick(); // starts
    const c0 = sim.state.resources.coalition;
    const a0 = sim.state.anger.activists;
    sim.tick();
    expect(c0 - sim.state.resources.coalition).toBeCloseTo(0.15 - config.drift.coalition, 5);
    expect(sim.state.anger.activists).toBeGreaterThan(a0);
  });

  it('isolation finance damage accumulates, stays after the penalty ends, and is capped', () => {
    const sim = quietSim();
    sim.state.resources.prestige = 0;
    sim.tick(); // starts
    advanceQuiet(sim, 10);
    expect(sim.state.financeModAccum).toBeCloseTo(-1.0, 5);
    sim.state.resources.prestige = 10;
    sim.tick(); // ends
    expect(sim.state.zeroPenalties.prestige).toBe(false);
    const kept = sim.state.financeModAccum;
    advanceQuiet(sim, 5);
    expect(sim.state.financeModAccum).toBe(kept);
    // cap
    sim.state.resources.prestige = 0;
    sim.state.financeModAccum = -14.95;
    advanceQuiet(sim, 5);
    expect(sim.state.financeModAccum).toBe(config.zeroPenalty.isolationFinanceCap);
  });
});

describe('anger decay', () => {
  it('moves toward the resting value by pullPerDay', () => {
    const sim = quietSim();
    const rest = sim.leaderDef.startAnger.media;
    sim.state.anger.media = rest + 10;
    sim.state.anger.eu = sim.leaderDef.startAnger.eu - 10;
    sim.tick();
    expect(sim.state.anger.media).toBeCloseTo(rest + 10 - config.anger.pullPerDay);
    expect(sim.state.anger.eu).toBeCloseTo(sim.leaderDef.startAnger.eu - 10 + config.anger.pullPerDay);
  });

  it('does not apply at 100', () => {
    const sim = quietSim();
    sim.state.anger.media = 100;
    sim.tick();
    expect(sim.state.anger.media).toBe(100);
  });

  it('can be disabled', () => {
    const sim = quietSim({}, cfgWith((c) => (c.anger.pullPerDay = 0)));
    sim.state.anger.media = 80;
    sim.tick();
    expect(sim.state.anger.media).toBe(80);
  });
});

describe('headless simulation', () => {
  it('runs all 1,456 days with no inputs except auto-picks', () => {
    const sim = makeSim({ seed: 'headless-1' });
    // avoid early termination so the full term is exercised
    const cfg = sim.cfg;
    expect(cfg.time.daysPerQuarter * cfg.time.quarters).toBe(1456);
    const summary = runToEnd(sim, createBot('firstCard', 'x'));
    expect(['win', 'loss', 'ending']).toContain(summary.outcome);
    expect(sim.isOver).toBe(true);
  });

  it('reaches election night after exactly 1,456 ticks when nothing ends the run early', () => {
    const cfg = cfgWith((c) => {
      c.drift = { finances: 0, support: 0, coalition: 0, prestige: 0 };
      c.budgetVote.enabled = false;
      c.compromise.chance = 0; // like the budget vote, a decision re-runs its day's tick
    });
    const data = { ...gameData(), events: gameData().events.map((e) => ({ ...e, chance: 0 })) };
    const sim = makeSim({ seed: 'full-term' }, cfg, data);
    let ticks = 0;
    while (!sim.isOver) {
      if (sim.state.phase === 'compromise') sim.dispatch({ kind: 'makeCompromise', cardId: sim.state.compromiseOffer![0] });
      else if (sim.state.phase === 'draft') sim.dispatch({ kind: 'pickPolicy', cardId: sim.state.draft!.hand[0] });
      // keep the run alive: pin coalition and anger to safe values
      sim.state.resources.coalition = 50;
      for (const g of ['oligarchs', 'pensioners', 'media', 'eu', 'activists'] as const) sim.state.anger[g] = 40;
      if (sim.state.phase === 'running') {
        sim.tick();
        ticks++;
      }
    }
    expect(ticks).toBe(1456);
    expect(sim.state.phase).toBe('election');
    expect(sim.state.quartersCompleted).toBe(16);
  });
});
