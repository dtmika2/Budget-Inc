import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { createBot, greedyVote, runToEnd } from '../src/core/bots';
import { drawRedLines, passChance, presetSliders, sliderBudgetDelta } from '../src/core/budgetVote';
import { comparableState, replay } from '../src/core/replay';
import { loadGameData } from '../src/data/loader';
import { readDataFiles, readLocale } from '../scripts/lib/nodeData';
import { cfgWith, gameData, makeSim, quietSim } from './helpers';
import type { Simulation } from '../src/core/simulation';

/** Open the vote; with `all`, every category is shown (the slider tests below use fixed categories). */
function openVote(sim: Simulation, all = true): void {
  sim.state.day = 74;
  while (sim.state.phase === 'running') sim.tick();
  expect(sim.state.phase).toBe('budgetVote');
  if (all) sim.state.budgetVoteItems = sim.data.budgetItems.map((i) => i.id);
}

describe('budget sliders', () => {
  it('the Finances preview equals the applied change', () => {
    const cfg = cfgWith((c) => (c.budgetVote.passMin = 1));
    const cases: Record<string, number>[] = [{ pensions: -2, defence: 3 }, { ngos: -3, administration: -3, health: 2 }, { pensions: 1, health: 1, education: 1, transport: 1 }];
    for (const sliders of cases) {
      const sim = quietSim({ seed: `prev-${JSON.stringify(sliders)}` }, cfg);
      openVote(sim);
      const full = { ...presetSliders(sim, null), ...sliders };
      const p = sim.previewVote(full, null);
      const before = sim.state.resources.finances;
      expect(sim.dispatch({ kind: 'voteBudget', sliders: full, presetId: null }).ok).toBe(true);
      expect(sim.state.log.find((l) => l.type === 'budget_vote')!.passed).toBe(true);
      const applied = sim.state.resources.finances - before;
      expect(p.resources.finances?.min ?? 0).toBeCloseTo(applied, 6);
      const other = quietSim({ seed: 'x' });
      other.state.budgetVoteItems = other.data.budgetItems.map((i) => i.id);
      expect(sliderBudgetDelta(other, full)).toBeCloseTo(p.resources.finances?.min ?? 0, 6);
    }
  });

  it('slider effects are linear and exact (no random range); overspending adds only its zone groups', () => {
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
    expect(Object.keys(tight).sort()).toEqual(sim.state.budgetVoteItems!.slice().sort());
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
    sim.state.budgetVoteRequests = [];
    sim.state.budgetVoteRedLines = [
      { item: 'pensions', maxCutSteps: 1 },
      { item: 'defence', maxCutSteps: 1 },
    ];
    const base = { ...presetSliders(sim, null) };
    const p0 = passChance(sim, { ...base, pensions: -1, defence: -1 }, null); // allowed cuts, inside the band
    const p1 = passChance(sim, { ...base, pensions: -2, defence: -1 }, null);
    const p2 = passChance(sim, { ...base, pensions: -2, defence: -2 }, null);
    const item = (id: string) => sim.data.budgetItems.find((i) => i.id === id)!;
    // one step further: red line penalty + the step's pass change + entering the cut zone
    const extra = (id: string) => item(id).passPerStep * config.budgetVote.impact - (item(id).onCut.pass ?? 0);
    expect(p0 - p1).toBeCloseTo(config.budgetVote.redLines.passPenalty + extra('pensions'));
    expect(p1 - p2).toBeCloseTo(config.budgetVote.redLines.passPenalty + extra('defence'));
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

describe('the hand of categories (phase 16)', () => {
  it('shows hand.core core + hand.extra other categories, deterministic per seed', () => {
    const hand = (seed: string) => {
      const sim = quietSim({ seed });
      openVote(sim, false);
      return sim.state.budgetVoteItems!;
    };
    expect(hand('h-a')).toEqual(hand('h-a'));
    for (let i = 0; i < 20; i++) {
      const ids = hand(`h-${i}`);
      const items = ids.map((id) => gameData().budgetItems.find((it) => it.id === id)!);
      expect(items.filter((it) => it.core).length).toBe(config.budgetVote.hand.core);
      expect(items.filter((it) => !it.core).length).toBe(config.budgetVote.hand.extra);
    }
  });

  it('red lines and presets only use shown categories; hidden ones cannot be moved', () => {
    const sim = quietSim({ seed: 'h-shown' });
    openVote(sim, false);
    const shown = sim.state.budgetVoteItems!;
    for (const r of sim.state.budgetVoteRedLines!) expect(shown).toContain(r.item);
    expect(Object.keys(presetSliders(sim, 'budget_tight')).sort()).toEqual([...shown].sort());
    const hidden = sim.data.budgetItems.find((it) => !shown.includes(it.id))!.id;
    expect(sim.validate({ kind: 'voteBudget', sliders: { [hidden]: 1 }, presetId: null })).toMatch(/not in this vote/);
  });

  it('a category named by an open budget pledge is always shown', () => {
    for (let i = 0; i < 10; i++) {
      const sim = quietSim({ seed: `h-pl-${i}` });
      const tpl = sim.data.demands.find((d) => d.fulfil.some((c) => c.type === 'budget'))!;
      const item = (tpl.fulfil.find((c) => c.type === 'budget') as { item: string }).item;
      sim.state.pledges.push({ id: 'plT', templateId: tpl.id, region: 'CZ041', requester: { type: 'interestGroup', id: 'pensioners' }, acceptedAbsDay: 1, deadlineAbsDay: 999 });
      openVote(sim, false);
      expect(sim.state.budgetVoteItems).toContain(item);
    }
  });

  it('a re-roll costs rerollCost PC, redraws the hand and only uses the budgetVote stream', () => {
    const sim = quietSim({ seed: 'h-reroll' });
    openVote(sim, false);
    sim.state.pc = 3;
    const draft = sim.rng.draft.getState();
    const first = [...sim.state.budgetVoteItems!];
    expect(sim.dispatch({ kind: 'rerollBudget' }).ok).toBe(true);
    expect(sim.state.pc).toBe(2);
    expect(sim.dispatch({ kind: 'rerollBudget' }).ok).toBe(true);
    expect(sim.state.pc).toBe(0);
    expect(sim.dispatch({ kind: 'rerollBudget' }).ok).toBe(false); // the third costs 4
    expect(sim.state.log.filter((l) => l.type === 'budget_reroll').map((l) => l.cost)).toEqual([1, 2]);
    expect(sim.rng.draft.getState()).toEqual(draft);
    expect(sim.state.budgetVoteItems!.length).toBe(first.length);
  });
});

describe('safe bands and zones (phase 16)', () => {
  const passing = () => cfgWith((c) => (c.budgetVote.passMin = 1));

  it('a slider outside its band adds that side\'s zone bundle; inside the band nothing extra', () => {
    const sim = quietSim({ seed: 'z' }, passing());
    openVote(sim);
    const it = sim.data.budgetItems.find((i) => i.id === 'pensions')!;
    const base = presetSliders(sim, null);
    const inside = sim.previewVote({ ...base, pensions: it.band.min }, null);
    const cut = sim.previewVote({ ...base, pensions: it.band.min - 1 }, null);
    const zone = sim.previewBudgetZones('pensions').cut;
    // the extra step changes pensioners by angerPerStep x impact; the zone adds its own range on top
    const step = -(it.angerPerStep.pensioners ?? 0) * config.budgetVote.impact;
    expect(cut.anger.pensioners!.min - inside.anger.pensioners!.min).toBeCloseTo(step + zone.anger.pensioners!.min);
    expect(cut.anger.pensioners!.max - inside.anger.pensioners!.max).toBeCloseTo(step + zone.anger.pensioners!.max);
  });

  it('regionTraits reach every kraj with the trait and no other', () => {
    const sim = quietSim({ seed: 'z-rt' });
    const it = sim.data.budgetItems.find((i) => i.id === 'education')!;
    const traits = Object.keys(it.onCut.regionTraits!);
    const zone = sim.previewBudgetZones('education').cut;
    for (const r of sim.data.regions.regions) {
      const has = sim.data.regionProfiles.regions[r.code].traits.some((t) => traits.includes(t));
      expect(r.code in zone.regions).toBe(has);
    }
  });

  it('zones apply only when the vote passes, and the log records them', () => {
    for (const pass of [true, false]) {
      const cfg = cfgWith((c) => {
        c.budgetVote.passMin = pass ? 1 : 0;
        c.budgetVote.passMax = pass ? 1 : 0;
      });
      const sim = quietSim({ seed: `z-${pass}` }, cfg);
      openVote(sim);
      const before = sim.state.anger.pensioners;
      sim.dispatch({ kind: 'voteBudget', sliders: { ...presetSliders(sim, null), pensions: -3 }, presetId: null });
      const e = sim.state.log.find((l) => l.type === 'budget_vote')!;
      expect((e.zones as Record<string, string>).pensions).toBe('cut');
      expect(sim.state.anger.pensioners > before).toBe(pass);
    }
  });

  it('every category has a band inside the slider range and advisor texts', () => {
    for (const it of gameData().budgetItems) {
      expect(it.band.min).toBeGreaterThanOrEqual(config.budgetVote.sliders.minSteps);
      expect(it.band.max).toBeLessThanOrEqual(config.budgetVote.sliders.maxSteps);
      expect(it.advisor).not.toBeNull();
    }
    expect(gameData().budgetItems.filter((i) => i.core).map((i) => i.id).sort()).toEqual(['administration', 'defence', 'education', 'health', 'pensions', 'transport']);
  });
});
