import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { availableChannels, createBot, runToEnd } from '../src/core/bots';
import { channelMults, scaleBundle, scoreMult } from '../src/core/compromise';
import { comparableState, replay } from '../src/core/replay';
import type { Simulation } from '../src/core/simulation';
import { loadGameData } from '../src/data/loader';
import { readDataFiles, readLocale } from '../scripts/lib/nodeData';
import { gameData, makeSim, quietSim } from './helpers';

/** Open a compromise decision offering `cards` right now. */
function openWith(sim: Simulation, cards: string[]): void {
  sim.state.compromiseOffer = cards;
  sim.state.phase = 'compromise';
}

describe('score multipliers', () => {
  it('are piecewise linear through atZero, 1 at the neutral score, atOne', () => {
    expect(scoreMult(0, 0.4, 1.6, 0.5)).toBeCloseTo(0.4);
    expect(scoreMult(0.5, 0.4, 1.6, 0.5)).toBeCloseTo(1);
    expect(scoreMult(1, 0.4, 1.6, 0.5)).toBeCloseTo(1.6);
    expect(scoreMult(0.25, 0.4, 1.6, 0.5)).toBeCloseTo(0.7);
    expect(scoreMult(2, 0.4, 1.6, 0.5)).toBeCloseTo(1.6); // clamped
  });

  it('score 1 gives gainAtOne/lossAtOne and score 0 gives gainAtZero/lossAtZero for every channel', () => {
    const sim = makeSim();
    for (const [id, ch] of Object.entries(config.compromise.channels)) {
      expect(channelMults(sim, id, 1)).toEqual({ gainMult: expect.closeTo(ch.gainAtOne), lossMult: expect.closeTo(ch.lossAtOne) });
      expect(channelMults(sim, id, 0)).toEqual({ gainMult: expect.closeTo(ch.gainAtZero), lossMult: expect.closeTo(ch.lossAtZero) });
      expect(channelMults(sim, id, config.compromise.neutralScore)).toEqual({ gainMult: expect.closeTo(1), lossMult: expect.closeTo(1) });
    }
  });

  it('scaleBundle scales gains and losses separately (anger: a drop is a gain)', () => {
    const b = scaleBundle(
      {
        regions: { CZ010: { min: 4, max: 6 }, CZ020: { min: -3, max: -2 } },
        anger: { oligarchs: { min: -8, max: -6 }, media: { min: 2, max: 2 } },
        budgetChanges: [{ chapter: '327', type: 'expenditure', changePct: 10 }],
      },
      1.5,
      0.5,
    );
    expect(b.regions!.CZ010).toEqual({ min: 6, max: 9 });
    expect(b.regions!.CZ020).toEqual({ min: -1.5, max: -1 });
    expect(b.anger!.oligarchs).toEqual({ min: -12, max: -9 });
    expect(b.anger!.media).toEqual({ min: 1, max: 1 });
    expect(b.budgetChanges![0].changePct).toBe(5); // spending up worsens the balance -> loss
  });

  it('a negative gain multiplier turns gains into losses', () => {
    const b = scaleBundle({ regions: { CZ010: { min: 4, max: 6 } } }, -0.5, 1.8);
    expect(b.regions!.CZ010).toEqual({ min: -3, max: -2 });
  });
});

describe('selling a compromise', () => {
  it('a neutral score applies exactly the plain deal', () => {
    const a = quietSim({ seed: 'neutral' });
    const b = quietSim({ seed: 'neutral' });
    openWith(a, ['dummy_comp_regions', 'dummy_comp_oligarchs']);
    openWith(b, ['dummy_comp_regions', 'dummy_comp_oligarchs']);
    expect(a.previewCompromise('dummy_comp_regions', 'debate', 0.5)).toEqual(b.previewCard('dummy_comp_regions'));
  });

  it('the preview matches the applied regional change for a fixed range', () => {
    const sim = quietSim({ seed: 'fixed' });
    const card = sim.compromiseById.get('dummy_comp_regions')!;
    const saved = card.regions;
    card.regions = { CZ010: { min: 5, max: 5 }, CZ080: { min: -4, max: -4 } };
    try {
      openWith(sim, ['dummy_comp_regions', 'dummy_comp_oligarchs']);
      const p = sim.previewCompromise('dummy_comp_regions', 'debate', 1);
      const before = { ...sim.state.regionShift };
      expect(sim.dispatch({ kind: 'makeCompromise', cardId: 'dummy_comp_regions', channelId: 'debate', score: 1 }).ok).toBe(true);
      expect(sim.state.regionShift.CZ010 - before.CZ010).toBeCloseTo(p.regions.CZ010!.min);
      expect(sim.state.regionShift.CZ080 - before.CZ080).toBeCloseTo(p.regions.CZ080!.min);
      expect(p.regions.CZ010!.min).toBeCloseTo(5 * config.compromise.channels.debate.gainAtOne);
      expect(p.regions.CZ080!.min).toBeCloseTo(-4 * config.compromise.channels.debate.lossAtOne);
    } finally {
      card.regions = saved;
    }
  });

  it('logs channel, score and multipliers; the score is rounded and clamped', () => {
    const sim = quietSim();
    openWith(sim, ['dummy_comp_regions', 'dummy_comp_oligarchs']);
    sim.dispatch({ kind: 'makeCompromise', cardId: 'dummy_comp_oligarchs', channelId: 'press', score: 0.8765 });
    const e = sim.state.log.find((l) => l.type === 'compromise_made')!;
    expect(e.channelId).toBe('press');
    expect(e.score).toBe(0.88);
    expect(e.gainMult).toBeCloseTo(channelMults(sim, 'press', 0.88).gainMult);
  });

  it('rejects bad scores and unknown channels', () => {
    const sim = quietSim();
    openWith(sim, ['dummy_comp_regions', 'dummy_comp_oligarchs']);
    const base = { kind: 'makeCompromise' as const, cardId: 'dummy_comp_regions' };
    expect(sim.validate({ ...base, channelId: 'press', score: 1.2 })).toMatch(/score/);
    expect(sim.validate({ ...base, channelId: 'press', score: Number.NaN })).toMatch(/score/);
    expect(sim.validate({ ...base, channelId: 'nope', score: 0.5 })).toMatch(/channel/);
    expect(sim.validate({ ...base, channelId: 'press', score: 0.5 })).toBeNull();
  });
});

describe('regional tour', () => {
  it('can be used once per game year and unlocks again next year', () => {
    const sim = quietSim();
    openWith(sim, ['dummy_comp_regions', 'dummy_comp_oligarchs']);
    expect(sim.dispatch({ kind: 'makeCompromise', cardId: 'dummy_comp_regions', channelId: 'tour', score: 0.9 }).ok).toBe(true);
    expect(sim.state.tourUsedInYear).toBe(1);
    sim.state.quarter = 3;
    openWith(sim, ['dummy_comp_finance', 'dummy_comp_oligarchs']);
    expect(sim.validate({ kind: 'makeCompromise', cardId: 'dummy_comp_finance', channelId: 'tour', score: 0.9 })).toMatch(/already used/);
    expect(availableChannels(sim)).not.toContain('tour');
    sim.state.quarter = 5;
    expect(sim.validate({ kind: 'makeCompromise', cardId: 'dummy_comp_finance', channelId: 'tour', score: 0.9 })).toBeNull();
  });

  it('a low score backfires (regional gains become losses); a high score beats the other channels', () => {
    const sim = quietSim();
    openWith(sim, ['dummy_comp_finance', 'dummy_comp_oligarchs']);
    const bad = sim.previewCompromise('dummy_comp_finance', 'tour', 0);
    const good = sim.previewCompromise('dummy_comp_finance', 'tour', 1);
    for (const code of Object.keys(bad.regions)) expect(bad.regions[code]!.max).toBeLessThan(0);
    for (const ch of ['press', 'debate']) {
      const other = sim.previewCompromise('dummy_comp_finance', ch, 1);
      for (const code of Object.keys(good.regions)) expect(good.regions[code]!.min).toBeGreaterThan(other.regions[code]!.min);
    }
  });

  it('is not skippable; press release and debate are', () => {
    expect(config.compromise.channels.tour.skippable).toBe(false);
    expect(config.compromise.channels.press.skippable).toBe(true);
    expect(config.compromise.channels.debate.skippable).toBe(true);
  });
});

describe('mini-game data, bots and replay', () => {
  it('a missing locale key in the mini-game texts is a load error', () => {
    const files = readDataFiles();
    const texts = JSON.parse(JSON.stringify(files['data/minigames/texts.json'])) as { pressSpin: string[] };
    texts.pressSpin[0] = 'minigame.nope';
    const r = loadGameData({ ...files, 'data/minigames/texts.json': texts }, readLocale());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === 'missingLocale' && e.detail === 'minigame.nope')).toBe(true);
  });

  it('bot runs use several channels and replay to the same final state', () => {
    const used = new Set<string>();
    for (const kind of ['random', 'greedy'] as const) {
      const sim = makeSim({ seed: `mg-${kind}` });
      runToEnd(sim, createBot(kind, `mg-${kind}`));
      for (const e of sim.state.log) if (e.type === 'compromise_made') used.add(String(e.channelId));
      const again = replay(gameData(), config, { seed: sim.state.seed, leader: sim.state.leader, difficulty: sim.state.difficulty, inputs: sim.state.inputs });
      expect(comparableState(again.state)).toEqual(comparableState(sim.state));
    }
    expect(used.size).toBeGreaterThanOrEqual(2);
  });
});
