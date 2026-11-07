import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { condemnTargets } from '../src/core/abilities';
import { createBot, runToEnd } from '../src/core/bots';
import { passChance, presetSliders } from '../src/core/budgetVote';
import { comparableState, replay } from '../src/core/replay';
import type { Simulation } from '../src/core/simulation';
import { scalar } from '../src/core/modifiers';
import type { EffectBundle, GameData, RegionEventTemplate } from '../src/core/types';
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
  it('Dotace: Finances +2 and EU anger +1.5 every month for 12 months (P24)', () => {
    const sim = quietSim({ leader: 'abis' });
    expect(use(sim, 'subsidies').ok).toBe(true);
    const pulses = sim.state.schedule.filter((e) => e.kind === 'abilityPulse' && e.payload.abilityId === 'subsidies');
    expect(pulses.length).toBe(12);
    const x0 = sim.state.financesExtra;
    const eu0 = sim.state.anger.eu;
    for (let i = 0; i < config.abilities.monthDays + 2 && !sim.state.log.some((l) => l.type === 'ability_pulse'); i++) sim.tick();
    const log = sim.state.log.filter((l) => l.type === 'ability_pulse' && l.abilityId === 'subsidies');
    expect(log.length).toBe(1);
    expect(log[0].deltas!.resources.finances).toBeGreaterThan(0);
    expect(sim.state.financesExtra - x0).toBeGreaterThan(1);
    expect(log[0].deltas!.anger.eu).toBeCloseTo(1.5, 6);
    expect(sim.state.anger.eu).toBeGreaterThan(eu0);
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

/** The log entry of the last ability use. */
const lastUse = (sim: Simulation) => sim.state.log.filter((l) => l.type === 'ability_used').at(-1)!;
/** Preview of a fixed bundle now. */
const now = (sim: Simulation, b: EffectBundle) => sim.preview(b, 'ability');
const pulsesOf = (sim: Simulation, id: string) => sim.state.log.filter((e) => e.type === 'ability_pulse' && e.abilityId === id);
const rolledOf = (e: object) => (e as { rolled: Record<string, number> }).rolled;
/** Pulses still scheduled (the quiet helpers clear the schedule at each modal, so count right after use). */
const scheduledPulses = (sim: Simulation, id: string) => sim.state.schedule.filter((e) => e.kind === 'abilityPulse' && e.payload.abilityId === id);

describe('Dezněk Břich', () => {
  it('Cesta na Tchaj-wan: the exact instant bundle, 12 pulses of +0.75 prestige, prestige gains x1.25 for 360 days', () => {
    const sim = quietSim({ leader: 'brich' });
    const p = sim.previewAbility('taiwan_trip');
    const gain = () => now(sim, { effects: { prestige: { min: 4, max: 4 } } }).resources.prestige!.min;
    const g0 = gain();
    expect(use(sim, 'taiwan_trip').ok).toBe(true);
    const d = lastUse(sim).deltas!;
    // the instant bundle goes through the start box but not the ability's own modifiers
    expect(d.resources.prestige).toBeCloseTo(p.resources.prestige!.min);
    expect(p.resources.prestige!.min).toBeCloseTo(now(quietSim({ leader: 'brich' }), { effects: { prestige: { min: 10, max: 10 } } }).resources.prestige!.min);
    expect(d.anger.eu).toBeCloseTo(-8);
    expect(d.anger.oligarchs).toBeCloseTo(6);
    expect(rolledOf(lastUse(sim)).financesExtra).toBeCloseTo(-4);
    expect(gain()).toBeCloseTo(g0 * 1.25);
    expect(sim.state.modifiers.find((m) => m.origin === 'ability:taiwan_trip' && m.target === 'prestige.gain')!.daysLeft).toBe(360);
    expect(sim.state.schedule.filter((e) => e.kind === 'abilityPulse' && e.payload.abilityId === 'taiwan_trip')).toHaveLength(12);
    const expected = now(sim, { effects: { prestige: { min: 0.75, max: 0.75 } } }).resources.prestige!.min;
    const from = sim.state.log.length;
    advanceQuiet(sim, config.abilities.monthDays + 1);
    const pulse = sim.state.log.slice(from).find((e) => e.type === 'ability_pulse')!;
    expect(pulse.deltas!.resources.prestige).toBeCloseTo(expected);
    advanceQuiet(sim, YEAR);
    expect(sim.state.modifiers.some((m) => m.origin === 'ability:taiwan_trip')).toBe(false);
  });

  it('Digitální stavebák: support -4 now, +1 PC per quarter while it runs, then back to normal', () => {
    const sim = quietSim({ leader: 'brich' });
    const pcBase = () => scalar(sim.pipeline(), 'pc.perQuarter', config.pc.perQuarter);
    const base = pcBase();
    advanceQuiet(sim, 60);
    const s0 = sim.state.resources.support;
    expect(use(sim, 'digital_permit').ok).toBe(true);
    expect(sim.state.resources.support - s0).toBeCloseTo(-4);
    expect(lastUse(sim).deltas!.anger.media).toBeCloseTo(6);
    expect(pcBase()).toBe(base + 1);
    expect(scheduledPulses(sim, 'digital_permit')).toHaveLength(12);
    // used on day 60, the next four quarter starts fall inside the 360 days
    const from = sim.state.log.length;
    advanceQuiet(sim, 4 * config.time.daysPerQuarter - 60);
    expect(sim.state.log.slice(from).filter((e) => e.type === 'quarter_started')).toHaveLength(4);
    expect(pcBase()).toBe(base + 1);
    advanceQuiet(sim, 360);
    expect(pcBase()).toBe(base);
  });

  it('Tramvaj do každého kraje: refuses without a kraj, lands on the chosen one (+2 Praha), preview equals applied', () => {
    const sim = quietSim({ leader: 'brich' });
    expect(use(sim, 'tram_everywhere').ok).toBe(false);
    expect(use(sim, 'tram_everywhere', 'CZ999').ok).toBe(false);
    const plain = (s: Simulation, code: string, v: number) => now(s, { regions: { [code]: { min: v, max: v } }, tags: ['transport'] }).regions[code]!.min;
    const p = sim.previewAbility('tram_everywhere', 'CZ042');
    expect(p.regions.CZ042!.min).toBeCloseTo(plain(sim, 'CZ042', 8));
    expect(p.regions.CZ010!.min).toBeCloseTo(plain(sim, 'CZ010', 2));
    const shift0 = { ...sim.state.regionShift };
    expect(use(sim, 'tram_everywhere', 'CZ042').ok).toBe(true);
    for (const code of ['CZ042', 'CZ010']) expect((sim.state.regionShift[code] ?? 0) - (shift0[code] ?? 0)).toBeCloseTo(p.regions[code]!.min);
    expect(lastUse(sim).target).toBe('CZ042');
    expect(use(sim, 'tram_everywhere', 'CZ041').ok).toBe(false); // once per game
    // Praha as the target gets both keys
    const praha = quietSim({ leader: 'brich', seed: 'praha' });
    const pp = praha.previewAbility('tram_everywhere', 'CZ010');
    expect(pp.regions.CZ010!.min).toBeCloseTo(plain(praha, 'CZ010', 10));
    const before = praha.state.regionShift.CZ010 ?? 0;
    use(praha, 'tram_everywhere', 'CZ010');
    expect((praha.state.regionShift.CZ010 ?? 0) - before).toBeCloseTo(pp.regions.CZ010!.min);
    // permanent: still there a year later
    advanceQuiet(praha, YEAR + 5);
    expect((praha.state.regionShift.CZ010 ?? 0) - before).toBeCloseTo(pp.regions.CZ010!.min);
  });
});

describe('Flipflip Motůrek', () => {
  it('Zmocněnec pro klima: EU anger gains halved, activists calm down half as easily, 12 pulses of +2 finances', () => {
    const sim = quietSim({ leader: 'moturek' });
    const eu = () => now(sim, { anger: { eu: { min: 4, max: 4 } } }).anger.eu!.min;
    const act = () => now(sim, { anger: { activists: { min: -4, max: -4 } } }).anger.activists!.min;
    const [eu0, act0] = [eu(), act()];
    expect(use(sim, 'climate_commissioner').ok).toBe(true);
    expect(lastUse(sim).deltas!.anger.eu).toBeCloseTo(-10);
    expect(lastUse(sim).deltas!.anger.activists).toBeCloseTo(10);
    expect(eu()).toBeCloseTo(eu0 * 0.5);
    expect(act()).toBeCloseTo(act0 * 0.5);
    expect(scheduledPulses(sim, 'climate_commissioner')).toHaveLength(12);
    advanceQuiet(sim, config.abilities.monthDays + 1);
    const pulses = pulsesOf(sim, 'climate_commissioner');
    expect(pulses.length).toBeGreaterThan(0);
    for (const e of pulses) expect(rolledOf(e).financesExtra).toBeCloseTo(2);
  });

  it('Hrad mě nechce: the election threshold is 1 lower until the election, still after day 360', () => {
    const sim = quietSim({ leader: 'moturek' });
    const t0 = sim.effectiveTBase();
    expect(use(sim, 'castle_rejection').ok).toBe(true);
    expect(sim.effectiveTBase()).toBe(t0 - 1);
    expect(sim.state.modifiers.find((m) => m.origin === 'ability:castle_rejection' && m.target === 'election.T_base')!.daysLeft).toBeUndefined();
    advanceQuiet(sim, YEAR + 30);
    expect(sim.effectiveTBase()).toBe(t0 - 1);
    // the 12-month part is over
    expect(sim.state.modifiers.filter((m) => m.origin === 'ability:castle_rejection').map((m) => m.target)).toEqual(['election.T_base']);
  });

  it('Benzín za 29,90: support +8 now, 12 pulses of +0.5 support and -1 finances', () => {
    const sim = quietSim({ leader: 'moturek' });
    const p = sim.previewAbility('cheap_fuel');
    expect(use(sim, 'cheap_fuel').ok).toBe(true);
    expect(lastUse(sim).deltas!.resources.support).toBeCloseTo(p.resources.support!.min);
    expect(lastUse(sim).deltas!.anger.pensioners).toBeCloseTo(p.anger.pensioners!.min);
    expect(scheduledPulses(sim, 'cheap_fuel')).toHaveLength(12);
    advanceQuiet(sim, config.abilities.monthDays + 1);
    const pulses = pulsesOf(sim, 'cheap_fuel');
    expect(rolledOf(pulses[0]).financesExtra).toBeLessThan(0);
    expect(rolledOf(pulses[0]).support).toBeGreaterThan(0);
  });
});

describe('bots and replay with abilities', () => {
  it('random and greedy runs use abilities and replay to the same final state', () => {
    for (const leader of gameData().leaders.map((l) => l.id))
      for (const kind of ['random', 'greedy'] as const) {
        const sim = makeSim({ seed: `ab-${leader}-${kind}`, leader });
        runToEnd(sim, createBot(kind, `ab-${leader}-${kind}`));
        if (kind === 'greedy') expect(sim.state.log.some((l) => l.type === 'ability_used')).toBe(true);
        // the replay covers a kraj-targeted ability use
        if (leader === 'brich' && kind === 'greedy')
          expect(sim.state.inputs.some((i) => i.input.kind === 'useAbility' && i.input.abilityId === 'tram_everywhere' && !!i.input.target)).toBe(true);
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
