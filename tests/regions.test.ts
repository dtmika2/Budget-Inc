import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { createBot, runToEnd } from '../src/core/bots';
import { exportRun } from '../src/core/log';
import { comparableState, replay } from '../src/core/replay';
import { loadGameData } from '../src/data/loader';
import { readDataFiles, readLocale } from '../scripts/lib/nodeData';
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

describe('compromises in the draft', () => {
  it('with chance 1 every hand has exactly one compromise and two policies', () => {
    const sim = makeSim({ seed: 'always' }, cfgWith((c) => (c.draft.compromiseChance = 1)));
    for (let q = 0; q < 16 && !sim.isOver; q++) {
      while (sim.state.phase !== 'draft' && !sim.isOver) {
        if (sim.state.phase === 'budgetVote') sim.dispatch({ kind: 'voteBudget', optionId: 'budget_balanced' });
        else sim.tick();
        sim.state.resources.coalition = 60;
        sim.state.anger.oligarchs = 30;
      }
      if (sim.isOver) break;
      const hand = sim.state.draft!.hand;
      expect(hand).toHaveLength(3);
      expect(hand.filter((id) => sim.compromiseById.has(id))).toHaveLength(1);
      expect(new Set(hand).size).toBe(3);
      sim.dispatch({ kind: 'pickPolicy', cardId: hand.find((id) => !sim.compromiseById.has(id))! });
    }
  });

  it('with chance 0 no compromise is ever offered', () => {
    const sim = makeSim({ seed: 'never' }, cfgWith((c) => (c.draft.compromiseChance = 0)));
    runToEnd(sim, createBot('random', 'never'));
    const shown = sim.state.log.filter((e) => e.type === 'draft_shown').flatMap((e) => e.cards as string[]);
    expect(shown.some((id) => sim.compromiseById.has(id))).toBe(false);
  });

  it('picking a compromise shifts regional support (not national), logs it, and moves S by the seat-weighted change', () => {
    const sim = makeSim({ seed: 'pick' }, cfgWith((c) => (c.draft.compromiseChance = 1)));
    const id = sim.state.draft!.hand.find((x) => sim.compromiseById.has(x))!;
    const comp = sim.compromiseById.get(id)!;
    const support0 = sim.state.resources.support;
    const shift0 = { ...sim.state.regionShift };
    const S0 = sim.computeProjection().S;
    const preview = sim.previewCard(id);
    expect(sim.dispatch({ kind: 'pickPolicy', cardId: id }).ok).toBe(true);
    const log = sim.state.log.find((e) => e.type === 'compromise_made')!;
    expect(log.cardId).toBe(id);
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

  it('regional losses get the difficulty negative multiplier in previews; gains do not', () => {
    const normal = makeSim({ seed: 'm', difficulty: 'normal' }).previewCard('dummy_comp_regions').regions;
    const hard = makeSim({ seed: 'm', difficulty: 'hard' }).previewCard('dummy_comp_regions').regions;
    expect(hard.CZ080!.min).toBeCloseTo(normal.CZ080!.min * config.difficulty.hard.negativeMultiplier);
    expect(hard.CZ010!.max).toBeCloseTo(normal.CZ010!.max);
  });

  it('caps a region shift at maxShift', () => {
    const sim = makeSim({ seed: 'cap' }, cfgWith((c) => (c.regions.maxShift = 5)));
    sim.state.draft!.hand = ['dummy_comp_regions'];
    sim.dispatch({ kind: 'pickPolicy', cardId: 'dummy_comp_regions' });
    for (const code of ['CZ010', 'CZ080', 'CZ042']) expect(Math.abs(sim.state.regionShift[code])).toBeLessThanOrEqual(5);
  });

  it('a run with compromises replays to the identical final state', () => {
    const cfg = cfgWith((c) => (c.draft.compromiseChance = 1));
    const sim = makeSim({ seed: 'replay-comp' }, cfg);
    runToEnd(sim, createBot('random', 'replay-comp'));
    expect(sim.state.log.some((e) => e.type === 'compromise_made')).toBe(true);
    const again = replay(gameData(), cfg, JSON.parse(JSON.stringify(exportRun(sim.state))));
    expect(comparableState(again.state)).toEqual(comparableState(sim.state));
  });
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
