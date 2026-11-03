import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { createBot, runToEnd } from '../src/core/bots';
import { exportRun } from '../src/core/log';
import { comparableState, replay } from '../src/core/replay';
import { loadGameData } from '../src/data/loader';
import { readDataFiles, readLocale } from '../scripts/lib/nodeData';
import type { Simulation } from '../src/core/simulation';
import { cfgWith, gameData, makeSim } from './helpers';

type AnyObj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const seatShare = () => {
  const regions = gameData().regions.regions;
  const total = regions.reduce((s, r) => s + r.seats, 0);
  return Object.fromEntries(regions.map((r) => [r.code, r.seats / total]));
};

describe('regional start jitter', () => {
  it('varies by region, is seeded, and keeps the seat-weighted national average unchanged', () => {
    const a = makeSim({ seed: 'jitter-1' });
    const b = makeSim({ seed: 'jitter-1' });
    const c = makeSim({ seed: 'jitter-2' });
    const shifts = Object.values(a.state.regionShift);
    expect(new Set(shifts.map((v) => v.toFixed(3))).size).toBeGreaterThan(5);
    expect(a.state.regionShift).toEqual(b.state.regionShift);
    expect(a.state.regionShift).not.toEqual(c.state.regionShift);
    const w = seatShare();
    const weighted = Object.entries(a.state.regionShift).reduce((s, [code, v]) => s + w[code] * v, 0);
    expect(weighted).toBeCloseTo(0, 9);
    // the starting projection's S equals national support (no clamping at the start values)
    expect(a.state.projection.S).toBeCloseTo(a.state.resources.support, 9);
    for (const v of shifts) expect(Math.abs(v)).toBeLessThanOrEqual(2 * config.regions.startJitter);
  });

  it('startJitter 0 gives every region the same support', () => {
    const sim = makeSim({ seed: 'flat' }, cfgWith((c) => (c.regions.startJitter = 0)));
    expect(new Set(Object.values(sim.state.projection.regionSupport)).size).toBe(1);
  });

  it('regional support = national support + offset + shift', () => {
    const sim = makeSim({ seed: 'formula' });
    const p = sim.computeProjection();
    for (const r of gameData().regions.regions)
      expect(p.regionSupport[r.code]).toBeCloseTo(sim.state.resources.support + sim.state.regionShift[r.code]);
  });
});

/** Tick until a compromise decision opens (keeping the run alive), resolving other modal phases. */
function untilCompromise(sim: Simulation, maxQuarters = 16): boolean {
  while (!sim.isOver && sim.state.quarter <= maxQuarters) {
    sim.state.resources.coalition = 60;
    sim.state.anger.oligarchs = 30;
    const ph = sim.state.phase;
    if (ph === 'compromise') return true;
    if (ph === 'draft') sim.dispatch({ kind: 'pickPolicy', cardId: sim.state.draft!.hand[0] });
    else if (ph === 'budgetVote') sim.dispatch({ kind: 'voteBudget', optionId: 'budget_balanced' });
    else sim.tick();
  }
  return false;
}

describe('compromise decision (two compromises against each other)', () => {
  const always = () => cfgWith((c) => (c.compromise.chance = 1));

  it('policy hands never contain compromise cards', () => {
    const sim = makeSim({ seed: 'hands' }, always());
    runToEnd(sim, createBot('random', 'hands'));
    const draws = sim.state.log.filter((e) => e.type === 'draft_shown');
    const shown = draws.flatMap((e) => e.cards as string[]);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.some((id) => sim.compromiseById.has(id))).toBe(false);
    expect(draws.every((e) => (e.cards as string[]).length === 3)).toBe(true);
  });

  it('with chance 1 a decision opens on the configured day of every quarter, offering two distinct compromises', () => {
    const sim = makeSim({ seed: 'every' }, always());
    const quarters: number[] = [];
    for (let i = 0; i < 6 && untilCompromise(sim); i++) {
      expect(sim.state.day).toBe(config.compromise.day);
      const offer = sim.state.compromiseOffer!;
      expect(offer).toHaveLength(config.compromise.choices);
      expect(new Set(offer).size).toBe(offer.length);
      expect(offer.every((id) => sim.compromiseById.has(id))).toBe(true);
      quarters.push(sim.state.quarter);
      sim.dispatch({ kind: 'makeCompromise', cardId: offer[1] });
      expect(sim.state.phase).toBe('running');
    }
    expect(quarters).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('the decision pauses the run: ticks do nothing until a compromise is made', () => {
    const sim = makeSim({ seed: 'pause' }, always());
    untilCompromise(sim);
    const day = sim.state.day;
    const ticks = sim.state.tickCount;
    sim.tick();
    sim.tick();
    expect(sim.state.day).toBe(day);
    expect(sim.state.tickCount).toBe(ticks);
  });

  it('only an offered compromise can be made; policies cannot be picked in its place', () => {
    const sim = makeSim({ seed: 'only' }, always());
    untilCompromise(sim);
    const notOffered = sim.compromises.find((c) => !sim.state.compromiseOffer!.includes(c.id))!.id;
    expect(sim.dispatch({ kind: 'makeCompromise', cardId: notOffered }).ok).toBe(false);
    expect(sim.dispatch({ kind: 'pickPolicy', cardId: 'dummy_revenue' }).ok).toBe(false);
    expect(sim.dispatch({ kind: 'makeCompromise', cardId: sim.state.compromiseOffer![0] }).ok).toBe(true);
    expect(sim.dispatch({ kind: 'makeCompromise', cardId: notOffered }).ok).toBe(false);
  });

  it('with chance 0 no decision ever opens', () => {
    const sim = makeSim({ seed: 'never' }, cfgWith((c) => (c.compromise.chance = 0)));
    runToEnd(sim, createBot('random', 'never'));
    expect(sim.state.log.some((e) => e.type === 'compromise_offered')).toBe(false);
  });

  it('making a compromise shifts regional support (not national), logs the rejected one, and moves S by the seat-weighted change', () => {
    const sim = makeSim({ seed: 'pick' }, always());
    untilCompromise(sim);
    const [id, other] = sim.state.compromiseOffer!;
    const comp = sim.compromiseById.get(id)!;
    const support0 = sim.state.resources.support;
    const shift0 = { ...sim.state.regionShift };
    const S0 = sim.computeProjection().S;
    const preview = sim.previewCard(id);
    expect(sim.dispatch({ kind: 'makeCompromise', cardId: id }).ok).toBe(true);
    const log = sim.state.log.find((e) => e.type === 'compromise_made')!;
    expect(log.cardId).toBe(id);
    expect(log.rejected).toEqual([other]);
    expect(sim.state.picked.at(-1)!.cardId).toBe(id);
    for (const code of Object.keys(comp.regions!)) {
      const d = sim.state.regionShift[code] - shift0[code];
      expect(d).toBeGreaterThanOrEqual(preview.regions[code]!.min - 1e-9);
      expect(d).toBeLessThanOrEqual(preview.regions[code]!.max + 1e-9);
      expect(log.deltas!.regions![code]).toBeCloseTo(d, 2);
    }
    if (!comp.effects?.support) expect(sim.state.resources.support).toBe(support0);
    const w = seatShare();
    const expectedDS = Object.keys(comp.regions!).reduce((s, code) => s + w[code] * (sim.state.regionShift[code] - shift0[code]), 0);
    expect(sim.computeProjection().S - S0).toBeCloseTo(expectedDS + (sim.state.resources.support - support0), 6);
  });

  it('does not offer a recently made compromise again within the cooldown', () => {
    const sim = makeSim({ seed: 'cool' }, always());
    const made: { id: string; q: number }[] = [];
    for (let i = 0; i < 8 && untilCompromise(sim); i++) {
      for (const m of made) {
        if (sim.state.quarter - m.q < config.compromise.cooldownQuarters) expect(sim.state.compromiseOffer).not.toContain(m.id);
      }
      const id = sim.state.compromiseOffer![0];
      made.push({ id, q: sim.state.quarter });
      sim.dispatch({ kind: 'makeCompromise', cardId: id });
    }
    expect(made.length).toBe(8);
  });

  it('regional losses get the difficulty negative multiplier in previews; gains do not', () => {
    const normal = makeSim({ seed: 'm', difficulty: 'normal' }).previewCard('dummy_comp_regions').regions;
    const hard = makeSim({ seed: 'm', difficulty: 'hard' }).previewCard('dummy_comp_regions').regions;
    expect(hard.CZ080!.min).toBeCloseTo(normal.CZ080!.min * config.difficulty.hard.negativeMultiplier);
    expect(hard.CZ010!.max).toBeCloseTo(normal.CZ010!.max);
  });

  it('caps a region shift at maxShift', () => {
    const cfg = cfgWith((c) => {
      c.regions.maxShift = 5;
      c.compromise.chance = 1;
    });
    const sim = makeSim({ seed: 'cap' }, cfg);
    untilCompromise(sim);
    sim.state.compromiseOffer = ['dummy_comp_regions', sim.state.compromiseOffer![0]];
    sim.dispatch({ kind: 'makeCompromise', cardId: 'dummy_comp_regions' });
    for (const code of ['CZ010', 'CZ080', 'CZ042']) expect(Math.abs(sim.state.regionShift[code])).toBeLessThanOrEqual(5);
  });

  for (const bot of ['random', 'greedy'] as const) {
    it(`a ${bot}-bot run with compromise decisions replays to the identical final state`, () => {
      const cfg = always();
      const sim = makeSim({ seed: `replay-comp-${bot}` }, cfg);
      runToEnd(sim, createBot(bot, `replay-comp-${bot}`));
      expect(sim.state.log.some((e) => e.type === 'compromise_made')).toBe(true);
      const again = replay(gameData(), cfg, JSON.parse(JSON.stringify(exportRun(sim.state))));
      expect(comparableState(again.state)).toEqual(comparableState(sim.state));
    });
  }
});

describe('compromise data validation', () => {
  const base = () => ({ files: JSON.parse(JSON.stringify(readDataFiles())), locale: readLocale() });
  const codes = (files: Record<string, unknown>, locale: Record<string, string>) => {
    const r = loadGameData(files, locale);
    return r.ok ? [] : r.errors.map((e) => e.code);
  };

  it('loads the dummy and filler compromises', () => {
    expect(gameData().compromises.filter((c) => c.id.startsWith('dummy_comp_'))).toHaveLength(4);
    expect(gameData().compromises.filter((c) => c.devOnly).length).toBeGreaterThan(0);
  });

  it('rejects an unknown region code', () => {
    const { files, locale } = base();
    (files['data/compromises/dummy.json'] as AnyObj[])[0].regions.CZ999 = { min: 1, max: 2 };
    expect(codes(files, locale)).toContain('unknownRegion');
  });

  it('rejects an id shared by a policy and a compromise', () => {
    const { files, locale } = base();
    (files['data/compromises/dummy.json'] as AnyObj[])[0].id = 'dummy_revenue';
    expect(codes(files, locale)).toContain('duplicateId');
  });

  it('rejects a compromise without any regional effect', () => {
    const { files, locale } = base();
    delete (files['data/compromises/dummy.json'] as AnyObj[])[0].regions;
    expect(codes(files, locale)).toContain('schema');
  });
});
