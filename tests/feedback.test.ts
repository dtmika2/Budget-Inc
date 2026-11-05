import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { blamedBundle } from '../src/core/abilities';
import { createBot } from '../src/core/bots';
import { resolveSpecialForBot } from '../src/core/specialCards';
import { drainPerDay, groupTargets, resourceSources, totalDrainPerDay } from '../src/core/groupPressure';
import { prestigeBonusChance } from '../src/core/prestigeBonus';
import { STREAM_NAMES } from '../src/core/rng';
import { GROUP_IDS } from '../src/core/types';
import { cfgWith, quietSim } from './helpers';

/** Interest-group pressure, prestige bonuses and the STB blame (P24, stakeholder feedback). */
describe('interest-group pressure', () => {
  it('uses the stakeholder weights, both ways round', () => {
    expect(groupTargets(config, 'media')).toEqual([
      { resource: 'support', weight: 1 },
      { resource: 'prestige', weight: 0.5 },
      { resource: 'coalition', weight: 0.33 },
    ]);
    expect(groupTargets(config, 'activists')).toEqual([{ resource: 'prestige', weight: 1.33 }]);
    expect(resourceSources(config, 'finances')).toEqual([
      { group: 'eu', weight: 1.3 },
      { group: 'oligarchs', weight: 1 },
    ]);
  });

  it('drains nothing at or below the threshold and perDayAtMax x weight at anger 100', () => {
    const anger = Object.fromEntries(GROUP_IDS.map((g) => [g, 50])) as Record<(typeof GROUP_IDS)[number], number>;
    expect(totalDrainPerDay(config, anger, 'support')).toBe(0);
    anger.eu = 100;
    expect(drainPerDay(config, anger, 'eu', 'finances')).toBeCloseTo(config.groupPressure.perDayAtMax * 1.3, 12);
    anger.eu = 75;
    expect(drainPerDay(config, anger, 'eu', 'finances')).toBeCloseTo(config.groupPressure.perDayAtMax * 1.3 * 0.5, 12);
  });

  it('one day of play drains exactly the computed amount', () => {
    const off = cfgWith((c) => (c.groupPressure.perDayAtMax = 0));
    const a = quietSim({ seed: 'press' });
    const b = quietSim({ seed: 'press' }, off);
    for (const sim of [a, b]) {
      sim.state.ongoing = [];
      sim.state.anger.media = 100;
      sim.state.anger.pensioners = 80;
    }
    const expected = totalDrainPerDay(config, { ...a.state.anger }, 'support');
    a.tick();
    b.tick();
    expect(b.state.resources.support - a.state.resources.support).toBeCloseTo(expected, 9);
    expect(expected).toBeGreaterThan(0);
  });
});

describe('prestige bonuses', () => {
  it('the chance grows with Prestige from the threshold and is capped', () => {
    const b = config.prestigeBonus;
    expect(prestigeBonusChance(config, b.from - 1)).toBe(0);
    expect(prestigeBonusChance(config, b.from)).toBeCloseTo(b.chanceAtFrom);
    expect(prestigeBonusChance(config, 100)).toBeLessThanOrEqual(b.chanceMax);
  });

  it('high Prestige brings logged bonuses; low Prestige none; only the prestige stream is used', () => {
    const run = (prestige: number) => {
      const sim = quietSim({ seed: 'prest' });
      sim.state.resources.prestige = prestige;
      const others = STREAM_NAMES.filter((n) => n !== 'prestige').map((n) => sim.rng[n].getState());
      const p0 = sim.rng.prestige.getState();
      for (let i = 0; i < 70 && sim.state.phase === 'running'; i++) {
        sim.state.resources.prestige = prestige;
        sim.tick();
      }
      return { sim, others, p0 };
    };
    const hi = run(100);
    const lo = run(0);
    const bonuses = hi.sim.state.log.filter((l) => l.type === 'prestige_bonus');
    expect(lo.sim.state.log.some((l) => l.type === 'prestige_bonus')).toBe(false);
    // two months: two rolls each, the same draws whatever the Prestige
    expect(hi.sim.rng.prestige.getState()).toEqual(lo.sim.rng.prestige.getState());
    expect(hi.sim.rng.prestige.getState()).not.toEqual(hi.p0);
    for (const l of bonuses) expect(['support', 'coalition', 'group']).toContain(l.kind);
  });
});

describe('STB blames the coalition partner', () => {
  const lossy = { effects: { support: { min: -4, max: -2 }, prestige: { min: -1, max: 1 }, coalition: { min: 1, max: 1 } } };

  it('drops Support / Prestige losses and charges Coalition half of them', () => {
    const sim = quietSim({ leader: 'abis' });
    expect(blamedBundle(sim, lossy).blamed).toBe(false); // not active yet
    expect(sim.dispatch({ kind: 'useAbility', abilityId: 'stb', target: 'media' }).ok).toBe(true);
    const { bundle, blamed } = blamedBundle(sim, lossy);
    expect(blamed).toBe(true);
    expect(bundle.effects!.support).toBeUndefined();
    expect(bundle.effects!.prestige).toEqual({ min: 0, max: 1 });
    // losses: support -4..-2, prestige -1..0 -> -5..-2, half on Coalition (+1 kept)
    expect(bundle.effects!.coalition).toEqual({ min: 1 - 2.5, max: 1 - 1 });
    expect(blamedBundle(sim, { effects: { support: { min: 1, max: 2 } } }).blamed).toBe(false);
  });

  it('covers the next 4 unpopular policies, then ends; card previews show it', () => {
    const sim = quietSim({ leader: 'abis', seed: 'blame' });
    sim.dispatch({ kind: 'useAbility', abilityId: 'stb', target: 'media' });
    expect(sim.state.blame?.left).toBe(4);
    const bot = createBot('firstCard', 'blame');
    let shifted = 0;
    for (let i = 0; i < 4000 && sim.state.blame && !sim.isOver; i++) {
      if (sim.state.phase === 'draft') {
        const hand = sim.state.draft!.hand;
        const loser = hand.find((id) => (sim.data.policies.find((c) => c.id === id)?.effects?.support?.min ?? 0) < 0) ?? hand[0];
        const p = sim.previewCard(loser);
        if (blamedBundle(sim, sim.data.policies.find((c) => c.id === loser)!).blamed) expect(p.resources.support?.min ?? 0).toBeGreaterThanOrEqual(0);
        sim.dispatch({ kind: 'pickPolicy', cardId: loser });
        shifted = sim.state.log.filter((l) => l.type === 'blame_shifted').length;
      } else if (sim.state.phase === 'running') sim.tick();
      else if (sim.state.phase === 'special') resolveSpecialForBot(sim);
      else bot.act(sim);
    }
    expect(shifted).toBeGreaterThan(0);
    expect(shifted).toBeLessThanOrEqual(4);
    if (shifted === 4) expect(sim.state.blame).toBeNull();
  });
});
