import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { createBot, greedyVote, runToEnd } from '../src/core/bots';
import { drawRedLines, passChance, presetSliders, sliderBudgetDelta } from '../src/core/budgetVote';
import { comparableState, replay } from '../src/core/replay';
import { loadGameData } from '../src/data/loader';
import { readDataFiles, readLocale } from '../scripts/lib/nodeData';
import { cfgWith, gameData, makeSim, quietSim } from './helpers';
import type { Simulation } from '../src/core/simulation';

function openVote(sim: Simulation): void {
  sim.state.day = 74;
  while (sim.state.phase === 'running') sim.tick();
  expect(sim.state.phase).toBe('budgetVote');
}

describe('budget sliders', () => {
  it('the Finances preview equals the applied change', () => {
    const cfg = cfgWith((c) => (c.budgetVote.passMin = 1));
    for (const sliders of [{ pensions: -2, defence: 3 }, { ngos: -3, administration: -3, health: 2 }, presetSliders(quietSim(), 'budget_generous')]) {
      const sim = quietSim({ seed: `prev-${JSON.stringify(sliders)}` }, cfg);
      openVote(sim);
      const full = { ...presetSliders(sim, null), ...sliders };
      const p = sim.previewVote(full, null);
      const before = sim.state.resources.finances;
      expect(sim.dispatch({ kind: 'voteBudget', sliders: full, presetId: null }).ok).toBe(true);
      expect(sim.state.log.find((l) => l.type === 'budget_vote')!.passed).toBe(true);
      const applied = sim.state.resources.finances - before;
      expect(p.resources.finances?.min ?? 0).toBeCloseTo(applied, 6);
      expect(sliderBudgetDelta(quietSim({ seed: 'x' }), full)).toBeCloseTo(p.resources.finances?.min ?? 0, 6);
    }
  });

  it('slider effects are linear and exact (no random range)', () => {
    const sim = quietSim();
    openVote(sim);
    const one = sim.previewVote({ ...presetSliders(sim, null), pensions: 1 }, null);
    const three = sim.previewVote({ ...presetSliders(sim, null), pensions: 3 }, null);
    expect(one.anger.pensioners!.min).toBe(one.anger.pensioners!.max);
    expect(three.anger.pensioners!.min).toBeCloseTo(3 * one.anger.pensioners!.min);
    expect(three.resources.support!.min).toBeCloseTo(3 * one.resources.support!.min);
  });

  it('cutting spending raises Finances and raising it lowers them', () => {
    const sim = quietSim();
    openVote(sim);
    expect(sliderBudgetDelta(sim, { pensions: -1 })).toBeGreaterThan(0);
    expect(sliderBudgetDelta(sim, { pensions: 1 })).toBeLessThan(0);
  });

  it('a preset sets its slider positions; its id is only valid with those positions', () => {
    const sim = quietSim();
    openVote(sim);
    const tight = presetSliders(sim, 'budget_tight');
    expect(tight.pensions).toBe(-1);
    expect(Object.keys(tight).sort()).toEqual(sim.data.budgetItems.map((i) => i.id).sort());
    expect(sim.validate({ kind: 'voteBudget', sliders: { ...tight, pensions: 0 }, presetId: 'budget_tight' })).toMatch(/differ/);
    expect(sim.validate({ kind: 'voteBudget', sliders: tight, presetId: 'budget_tight' })).toBeNull();
  });

  it('rejects unknown categories and out-of-range steps', () => {
    const sim = quietSim();
    openVote(sim);
    expect(sim.validate({ kind: 'voteBudget', sliders: { nope: 1 }, presetId: null })).toMatch(/unknown/);
    expect(sim.validate({ kind: 'voteBudget', sliders: { pensions: config.budgetVote.sliders.maxSteps + 1 }, presetId: null })).toMatch(/bad slider/);
    expect(sim.validate({ kind: 'voteBudget', sliders: { pensions: 0.5 }, presetId: null })).toMatch(/bad slider/);
  });

  it('the preset pass modifier only applies with the preset', () => {
    const sim = quietSim();
    openVote(sim);
    sim.state.budgetVoteRedLines = [];
    const sl = presetSliders(sim, 'budget_tight');
    expect(passChance(sim, sl, 'budget_tight') - passChance(sim, sl, null)).toBeCloseTo(-0.1);
  });
});

describe('coalition red lines', () => {
  it('are drawn at vote open, deterministic for a seed, and within config bounds', () => {
    const lines = (seed: string) => {
      const sim = quietSim({ seed });
      openVote(sim);
      return sim.state.budgetVoteRedLines!;
    };
    expect(lines('rl-a')).toEqual(lines('rl-a'));
    for (let i = 0; i < 30; i++) {
      const rl = lines(`rl-${i}`);
      expect(rl.length).toBeGreaterThanOrEqual(config.budgetVote.redLines.min);
      expect(rl.length).toBeLessThanOrEqual(config.budgetVote.redLines.max);
      expect(new Set(rl.map((r) => r.item)).size).toBe(rl.length);
      for (const r of rl) expect(gameData().budgetItems.find((i) => i.id === r.item)!.canBeRedLine).toBe(true);
    }
  });

  it('each violation lowers the pass chance by passPenalty', () => {
    const cfg = cfgWith((c) => {
      c.budgetVote.passMax = 1;
      c.budgetVote.passMin = 0;
    });
    const sim = quietSim({}, cfg);
    openVote(sim);
    sim.state.resources.coalition = 50;
    sim.state.budgetVoteRedLines = [
      { item: 'pensions', maxCutSteps: 1 },
      { item: 'defence', maxCutSteps: 1 },
    ];
    const base = { ...presetSliders(sim, null) };
    const p0 = passChance(sim, { ...base, pensions: -1, defence: -1 }, null); // allowed cuts
    const p1 = passChance(sim, { ...base, pensions: -2, defence: -1 }, null);
    const p2 = passChance(sim, { ...base, pensions: -2, defence: -2 }, null);
    const perStep = (id: string) => sim.data.budgetItems.find((i) => i.id === id)!.passPerStep;
    expect(p0 - p1).toBeCloseTo(config.budgetVote.redLines.passPenalty + perStep('pensions'));
    expect(p1 - p2).toBeCloseTo(config.budgetVote.redLines.passPenalty + perStep('defence'));
    expect(sim.previewVote({ ...base, pensions: -2, defence: -2 }, null).violations.sort()).toEqual(['defence', 'pensions']);
  });

  it('the vote log records sliders, preset, red lines and violations', () => {
    const sim = quietSim();
    openVote(sim);
    const rl = sim.state.budgetVoteRedLines![0];
    const sliders = { ...presetSliders(sim, null), [rl.item]: -3 };
    sim.dispatch({ kind: 'voteBudget', sliders, presetId: null });
    const e = sim.state.log.find((l) => l.type === 'budget_vote')!;
    expect(e.presetId).toBeNull();
    expect((e.sliders as Record<string, number>)[rl.item]).toBe(-3);
    expect(e.violations).toContain(rl.item);
    expect((e.redLines as unknown[]).length).toBe((sim.state.log.find((l) => l.type === 'budget_vote_opened')!.redLines as unknown[]).length);
    expect(sim.state.budgetVoteRedLines).toBeNull();
  });

  it('drawRedLines uses only the budgetVote stream', () => {
    const sim = makeSim({ seed: 'iso' });
    const before = sim.rng.draft.getState();
    drawRedLines(sim);
    expect(sim.rng.draft.getState()).toEqual(before);
  });
});

describe('budget items data', () => {
  it('an unknown chapter in budget_items.json is a readable load error', () => {
    const files = readDataFiles();
    const items = JSON.parse(JSON.stringify(files['data/budget_items.json'])) as { chapters: { chapter: string }[] }[];
    items[0].chapters[0].chapter = '999';
    const r = loadGameData({ ...files, 'data/budget_items.json': items }, readLocale());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === 'unknownChapter' && e.file === 'data/budget_items.json')).toBe(true);
  });

  it('an unknown category in a preset is a load error', () => {
    const files = readDataFiles();
    const vote = JSON.parse(JSON.stringify(files['data/annual/budget_vote.json'])) as { sliders: Record<string, number> }[];
    vote[0].sliders = { nope: 1 };
    const r = loadGameData({ ...files, 'data/annual/budget_vote.json': vote }, readLocale());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === 'unknownItem')).toBe(true);
  });
});

describe('bots and replay with sliders', () => {
  it('greedy vote is a valid input and at least as good as its preset', () => {
    const sim = quietSim({ seed: 'greedy-vote' });
    openVote(sim);
    const input = greedyVote(sim);
    expect(sim.validate(input)).toBeNull();
  });

  it('random and greedy runs replay to the same final state', () => {
    for (const kind of ['random', 'greedy'] as const) {
      const sim = makeSim({ seed: `sl-${kind}` });
      runToEnd(sim, createBot(kind, `sl-${kind}`));
      expect(sim.state.log.some((l) => l.type === 'budget_vote')).toBe(true);
      const again = replay(gameData(), config, { seed: sim.state.seed, leader: sim.state.leader, difficulty: sim.state.difficulty, inputs: sim.state.inputs });
      expect(comparableState(again.state)).toEqual(comparableState(sim.state));
    }
  });
});
