import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { condemnTargets } from '../src/core/abilities';
import { createBot, runToEnd } from '../src/core/bots';
import { passChance, presetSliders } from '../src/core/budgetVote';
import { comparableState, replay } from '../src/core/replay';
import type { Simulation } from '../src/core/simulation';
import type { GameData, RegionEventTemplate } from '../src/core/types';
import { advanceQuiet, cfgWith, gameData, makeSim, quietSim } from './helpers';

const use = (sim: Simulation, abilityId: string, target?: string) => sim.dispatch({ kind: 'useAbility', abilityId, target });
const YEAR = 12 * config.abilities.monthDays;

describe('abilities: once per game', () => {
  it('every leader has three abilities, each usable once, with no yearly recharge', () => {
    for (const l of gameData().leaders) expect(l.abilities).toHaveLength(3);
    const sim = quietSim({ leader: 'mupka' });
    expect(use(sim, 'godfathers').ok).toBe(true);
    expect(use(sim, 'godfathers').ok).toBe(false);
    advanceQuiet(sim, 91 * 5);
    expect(use(sim, 'godfathers').ok).toBe(false);
    expect(use(sim, 'press_release').ok).toBe(true);
  });

  it('another leader\'s ability is unknown', () => {
    expect(use(quietSim({ leader: 'mupka' }), 'stb', 'media').ok).toBe(false);
  });
});

describe('Kartin Mupka', () => {
  it('Tisková zpráva: 12 monthly pulses of -3 media, media anger halved, modifiers end after 12 months', () => {
    const sim = quietSim({ leader: 'mupka' });
    use(sim, 'press_release');
    const pulses = sim.state.schedule.filter((e) => e.kind === 'abilityPulse');
    expect(pulses.map((e) => e.absDay - sim.absDay)).toEqual(Array.from({ length: 12 }, (_, i) => (i + 1) * config.abilities.monthDays));
    const a0 = sim.state.anger.media;
    const pull = sim.state.log.length;
    advanceQuiet(sim, config.abilities.monthDays + 1);
    const pulse = sim.state.log.slice(pull).find((e) => e.type === 'ability_pulse')!;
    expect(pulse.deltas!.anger.media).toBeCloseTo(-3);
    void a0;
    // media get angry half as fast while it runs (compared with a fresh run of the same leader)
    const fresh = quietSim({ leader: 'mupka' }).preview({ anger: { media: { min: 4, max: 4 } } }, 'policy').anger.media!.min;
    expect(sim.preview({ anger: { media: { min: 4, max: 4 } } }, 'policy').anger.media!.min).toBeCloseTo(fresh * 0.5);
    advanceQuiet(sim, YEAR);
    expect(sim.state.modifiers.some((m) => m.origin === 'ability:press_release')).toBe(false);
  });

  it('Tisková zpráva: the press-release compromise channel scores better', () => {
    const sim = quietSim({ leader: 'mupka' });
    const card = sim.compromises[0].id;
    const before = sim.previewCompromise(card, 'press', 0.5);
    use(sim, 'press_release');
    const after = sim.previewCompromise(card, 'press', 0.5);
    expect(after).not.toEqual(before);
  });

  it('Kmotři: oligarchs -20 and media +5 at once, oligarch anger gains halved', () => {
    const sim = quietSim({ leader: 'mupka' });
    sim.state.anger.oligarchs = 60;
    const m0 = sim.state.anger.media;
    const gain = () => sim.preview({ anger: { oligarchs: { min: 4, max: 4 } } }, 'policy').anger.oligarchs!.min;
    const g0 = gain();
    const o0 = sim.state.anger.oligarchs;
    use(sim, 'godfathers');
    // the instant -20 goes through the leader's other modifiers (start box) but not Kmotri's own
    expect(sim.state.anger.oligarchs).toBeLessThan(o0 - 10);
    expect(sim.state.log.at(-1)!.deltas!.anger.oligarchs).toBeCloseTo(sim.preview({ anger: { oligarchs: { min: -20, max: -20 } } }, 'ability').anger.oligarchs!.min / 1.5);
    expect(sim.state.anger.media - m0).toBeGreaterThan(0);
    expect(gain()).toBeCloseTo(g0 * 0.5);
    expect(sim.state.schedule.filter((e) => e.kind === 'abilityPulse')).toHaveLength(12);
  });

  it('Důrazné odsouzení cancels an open region event, a demand, a waiting response or an ongoing effect without effects', () => {
    const tpl: RegionEventTemplate = {
      id: 'tst', status: 'DUMMY', animation: 'flood', regionWeights: {}, title: 'regionEvent.flood.title', text: 'regionEvent.flood.text', variants: [],
      onIntervene: { regions: { self: { min: 3, max: 3 } } }, onIgnore: { regions: { self: { min: -9, max: -9 } } },
    };
    const data: GameData = { ...gameData(), regionEvents: [tpl] };
    for (const kind of ['regionEvent', 'demand', 'response', 'ongoing'] as const) {
      const sim = quietSim({ leader: 'mupka', seed: `cond-${kind}` }, config, data);
      expect(use(sim, 'condemnation', 'regionEvent:nope').ok).toBe(false); // nothing to cancel
      if (kind === 'regionEvent') {
        sim.state.regionEvents.push({ id: 'rv', templateId: 'tst', region: 'CZ041', variant: null, spawnAbsDay: sim.absDay, expireAbsDay: sim.absDay + 30 });
        sim.state.schedule.push({ kind: 'regionEventExpire', absDay: sim.absDay + 30, seq: 999, payload: { eventId: 'rv' } });
      } else if (kind === 'demand') {
        const d = sim.data.demands[0];
        sim.state.demands.push({ id: 'dm', templateId: d.id, region: 'CZ041', requester: { type: 'interestGroup', id: 'media' }, spawnAbsDay: sim.absDay, expireAbsDay: sim.absDay + 30 });
        sim.state.schedule.push({ kind: 'demandExpire', absDay: sim.absDay + 30, seq: 998, payload: { demandId: 'dm' } });
      } else if (kind === 'response') {
        const ev = sim.data.events.find((e) => e.responses)!;
        sim.state.pendingResponses.push({ instanceId: 'evtT', eventId: ev.id, firedAbsDay: sim.absDay });
      } else {
        sim.state.ongoing.push({ key: 'ogT', origin: 'chaos:x', source: 'chaos', target: 'support', perDay: -0.5, daysLeft: 50 });
      }
      const target = condemnTargets(sim)[0].target;
      const shift = sim.state.regionShift.CZ041;
      expect(use(sim, 'condemnation', target).ok).toBe(true);
      expect(condemnTargets(sim)).toEqual([]);
      expect(sim.state.schedule.some((e) => e.kind === 'regionEventExpire' || e.kind === 'demandExpire')).toBe(false);
      advanceQuiet(sim, 31);
      expect(sim.state.regionShift.CZ041).toBeCloseTo(shift);
      expect(sim.state.log.some((e) => e.type === 'event_condemned' && e.kind === kind)).toBe(true);
      expect(sim.state.log.some((e) => e.type === 'region_event_ignored' || e.type === 'demand_ignored' || e.type === 'event_response')).toBe(false);
    }
  });
});

describe('Bander Abiš', () => {
  it('Dotace doubles budget changes both ways', () => {
    const sim = quietSim({ leader: 'abis' });
    const bundle = (pct: number) => ({ budgetChanges: [{ chapter: '313', type: 'expenditure' as const, changePct: pct }] });
    const up = sim.preview(bundle(-5), 'policy').resources.finances!.min;
    const down = sim.preview(bundle(5), 'policy').resources.finances!.min;
    use(sim, 'subsidies');
    // budget-driven Finances move only through budget.change: exactly twice as much, both ways
    expect(sim.preview(bundle(-5), 'policy').resources.finances!.min).toBeCloseTo(up * 2, 6);
    expect(sim.preview(bundle(5), 'policy').resources.finances!.min).toBeCloseTo(down * 2, 6);
  });

  it('Microbossing: coalition only rises, party demands only help, red lines are free', () => {
    const cfg = cfgWith((c) => {
      c.budgetVote.passMin = 0;
      c.budgetVote.passMax = 1;
    });
    const sim = quietSim({ leader: 'abis' }, cfg);
    use(sim, 'microbossing');
    expect(sim.preview({ effects: { coalition: { min: -8, max: -8 } } }, 'policy').resources.coalition?.min ?? 0).toBeCloseTo(0);
    const tpl = sim.data.demands.find((d) => d.requesterTypes.includes('party'))!;
    const pr = sim.previewDemand(tpl.id, 'CZ041', { type: 'party', id: 'ano' });
    for (const o of [pr.reject, pr.fail, pr.ignore, pr.accept]) {
      for (const r of Object.values(o.resources)) expect(r!.min).toBeGreaterThanOrEqual(0);
      for (const r of Object.values(o.anger)) expect(r!.max).toBeLessThanOrEqual(0);
      for (const r of Object.values(o.regions)) expect(r!.min).toBeGreaterThanOrEqual(0);
    }
    sim.state.day = 74;
    while (sim.state.phase === 'running') sim.tick();
    sim.state.budgetVoteRedLines = [{ item: sim.state.budgetVoteItems![0], maxCutSteps: 1 }];
    const sl = presetSliders(sim, null);
    const cut = { ...sl, [sim.state.budgetVoteItems![0]]: -2 };
    const item = sim.data.budgetItems.find((i) => i.id === sim.state.budgetVoteItems![0])!;
    const stepAndZone = item.passPerStep * config.budgetVote.impact * -2 + (item.onCut.pass ?? 0);
    expect(passChance(sim, cut, null) - passChance(sim, sl, null)).toBeCloseTo(stepAndZone);
  });

  it('STB halves the chosen group\'s anger and slows its anger for half a year', () => {
    const sim = quietSim({ leader: 'abis' });
    sim.state.anger.pensioners = 80;
    expect(use(sim, 'stb').ok).toBe(false); // needs a group
    const p = sim.previewAbility('stb', 'pensioners');
    expect(use(sim, 'stb', 'pensioners').ok).toBe(true);
    expect(sim.state.anger.pensioners).toBeCloseTo(40);
    expect(p.anger.pensioners!.min).toBeCloseTo(-40);
    expect(sim.state.modifiers.find((m) => m.origin === 'ability:stb' && m.target === 'anger.pensioners.gain')!.daysLeft).toBe(180);
  });
});

describe('bots and replay with abilities', () => {
  it('random and greedy runs use abilities and replay to the same final state', () => {
    for (const leader of ['mupka', 'abis'] as const)
      for (const kind of ['random', 'greedy'] as const) {
        const sim = makeSim({ seed: `ab-${leader}-${kind}`, leader });
        runToEnd(sim, createBot(kind, `ab-${leader}-${kind}`));
        if (kind === 'greedy') expect(sim.state.log.some((l) => l.type === 'ability_used')).toBe(true);
        const again = replay(gameData(), config, { seed: sim.state.seed, leader, difficulty: sim.state.difficulty, inputs: sim.state.inputs });
        expect(comparableState(again.state)).toEqual(comparableState(sim.state));
      }
  });
});

describe('ability icons', () => {
  it('every ability has a 16 x 16 icon with known pixel letters', async () => {
    const { ABILITY_ICONS, iconRects } = await import('../src/ui/abilityIcons');
    for (const l of gameData().leaders)
      for (const a of l.abilities) {
        const grid = ABILITY_ICONS[a.icon];
        expect(grid, a.icon).toBeDefined();
        expect(grid).toHaveLength(16);
        for (const row of grid) expect(row).toHaveLength(16);
        expect(() => iconRects(grid)).not.toThrow();
      }
  });
});
