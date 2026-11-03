import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { createBot, runToEnd } from '../src/core/bots';
import { regionCohorts } from '../src/core/regions';
import { comparableState, replay } from '../src/core/replay';
import type { Simulation } from '../src/core/simulation';
import type { GameData, OpenRegionEvent, RegionEventTemplate } from '../src/core/types';
import { loadGameData } from '../src/data/loader';
import { readDataFiles, readLocale } from '../scripts/lib/nodeData';
import { advanceQuiet, cfgWith, gameData, makeSim, quietSim, resolveModal } from './helpers';

const fixed = (v: number) => ({ min: v, max: v });

/** A sim whose data has one custom region event template (fixed ranges), open in `region`. */
function withEvent(tpl: Partial<RegionEventTemplate> = {}, region = 'CZ041', seed = 'rev'): { sim: Simulation; ev: OpenRegionEvent } {
  const full: RegionEventTemplate = {
    id: 'test_event',
    status: 'DUMMY',
    animation: 'flood',
    regionWeights: {},
    title: 'regionEvent.flood.title',
    text: 'regionEvent.flood.text',
    variants: [],
    onIntervene: { regions: { self: fixed(3) }, anger: { pensioners: fixed(-2) } },
    onIgnore: { regions: { self: fixed(-4) }, anger: { pensioners: fixed(3) } },
    ...tpl,
  };
  const data: GameData = { ...gameData(), regionEvents: [full] };
  const sim = quietSim({ seed }, config, data);
  const ev: OpenRegionEvent = { id: 'revT', templateId: full.id, region, variant: null, spawnAbsDay: sim.absDay, expireAbsDay: sim.absDay + 30 };
  sim.state.regionEvents.push(ev);
  sim.state.schedule.push({ kind: 'regionEventExpire', absDay: ev.expireAbsDay, seq: 9999, payload: { eventId: ev.id } });
  return { sim, ev };
}

describe('region event data', () => {
  it('the bundled templates load and cover the five animations', () => {
    expect(new Set(gameData().regionEvents.map((t) => t.animation))).toEqual(new Set(['flood', 'blackout', 'protest', 'factory', 'duo']));
    expect(gameData().regionEvents.find((t) => t.id === 'duo')!.variants.map((v) => v.id)).toEqual(['meman', 'vlaus']);
  });

  it('unknown traits, regions and texts are load errors', () => {
    const files = readDataFiles();
    const bad = JSON.parse(JSON.stringify(files['data/region_events/dummy.json'])) as Record<string, unknown>[];
    bad[0].regionWeights = { swamp: 2 };
    bad[1].text = 'regionEvent.nope';
    (bad[2].onIgnore as { regions: Record<string, unknown> }).regions = { CZ999: fixed(-1) };
    const r = loadGameData({ ...files, 'data/region_events/dummy.json': bad }, readLocale());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(new Set(r.errors.map((e) => e.code))).toEqual(new Set(['unknownTrait', 'missingLocale', 'unknownRegion']));
  });
});

describe('spawning', () => {
  const run = (enabled: boolean, days = 370) => {
    const cfg = cfgWith((c) => (c.regionEvents.enabled = enabled));
    const sim = makeSim({ seed: 'rev-spawn' }, cfg);
    const keep = (k: string) => k === 'budgetVote' || k === 'regionEventSpawn';
    for (let d = 0; d < days && !sim.isOver; ) {
      if (sim.state.phase !== 'running') resolveModal(sim);
      else {
        sim.state.schedule = sim.state.schedule.filter((e) => keep(e.kind));
        // answer nothing: every event times out (expiry entries are dropped above, so ignore them by hand)
        for (const e of [...sim.state.regionEvents]) sim.dispatch({ kind: 'ignoreRegionEvent', eventId: e.id });
        sim.tick();
        d++;
      }
    }
    return sim;
  };

  it('every kraj gets exactly one event in the first year, deterministically', () => {
    const a = run(true);
    const b = run(true);
    const spawned = a.state.log.filter((e) => e.type === 'region_event_spawned' && e.absDay <= 4 * config.time.daysPerQuarter);
    expect(spawned.map((e) => e.region as string).sort()).toEqual(gameData().regions.regions.map((r) => r.code).sort());
    expect(spawned).toEqual(b.state.log.filter((e) => e.type === 'region_event_spawned' && e.absDay <= 4 * config.time.daysPerQuarter));
  });

  it('leaves every other RNG stream alone', () => {
    const on = run(true);
    const off = run(false);
    for (const stream of ['draft', 'effects', 'chaos', 'opportunities', 'budgetVote', 'regions', 'demands'] as const)
      expect(on.rng[stream].getState()).toEqual(off.rng[stream].getState());
  });
});

describe('answering', () => {
  it('intervening applies onIntervene and removes the event and its expiry', () => {
    const { sim, ev } = withEvent();
    const s0 = sim.state.regionShift.CZ041;
    const a0 = sim.state.anger.pensioners;
    sim.dispatch({ kind: 'interveneRegionEvent', eventId: ev.id });
    expect(sim.state.regionShift.CZ041 - s0).toBeCloseTo(3);
    expect(sim.state.anger.pensioners - a0).toBeCloseTo(-2);
    expect(sim.state.regionEvents).toEqual([]);
    expect(sim.state.schedule.some((e) => e.kind === 'regionEventExpire')).toBe(false);
    expect(sim.state.log.at(-1)!.type).toBe('region_event_intervened');
  });

  it('ignoring and timing out both apply onIgnore', () => {
    const a = withEvent({}, 'CZ041', 'rev-ign');
    const s0 = a.sim.state.regionShift.CZ041;
    a.sim.dispatch({ kind: 'ignoreRegionEvent', eventId: a.ev.id });
    expect(a.sim.state.regionShift.CZ041 - s0).toBeCloseTo(-4);

    const b = withEvent({}, 'CZ041', 'rev-time');
    advanceQuiet(b.sim, 31);
    const e = b.sim.state.log.find((l) => l.type === 'region_event_ignored')!;
    expect(e.timedOut).toBe(true);
    expect(e.deltas!.regions!.CZ041).toBeCloseTo(-4);
  });

  it('an intervention costing more PC than the player has is refused', () => {
    const { sim, ev } = withEvent({ onIntervene: { pc: -5 } });
    sim.state.pc = 2;
    expect(sim.dispatch({ kind: 'interveneRegionEvent', eventId: ev.id }).ok).toBe(false);
    sim.state.pc = 5;
    sim.dispatch({ kind: 'interveneRegionEvent', eventId: ev.id });
    expect(sim.state.pc).toBe(0);
  });

  it('the preview equals what is applied', () => {
    const { sim, ev } = withEvent();
    const p = sim.previewRegionEvent(ev.templateId, ev.region);
    const before = sim.state.regionShift.CZ041;
    sim.dispatch({ kind: 'ignoreRegionEvent', eventId: ev.id });
    expect(sim.state.regionShift.CZ041 - before).toBeCloseTo(p.ignore.regions.CZ041!.min);
    expect(p.intervene.regions.CZ041!.min).toBeCloseTo(3);
  });
});

describe('bots and replay with region events', () => {
  it('random and greedy runs answer region events and replay to the same final state', () => {
    for (const kind of ['random', 'greedy'] as const) {
      const sim = makeSim({ seed: `rev-${kind}` });
      runToEnd(sim, createBot(kind, `rev-${kind}`));
      expect(sim.state.log.some((l) => l.type === 'region_event_intervened' || l.type === 'region_event_ignored')).toBe(true);
      const again = replay(gameData(), config, { seed: sim.state.seed, leader: sim.state.leader, difficulty: sim.state.difficulty, inputs: sim.state.inputs });
      expect(comparableState(again.state)).toEqual(comparableState(sim.state));
    }
  });
});

describe('region cohorts', () => {
  it('shares sum to 100 and follow anger, traits and regional support', () => {
    const data = gameData();
    const anger = { oligarchs: 30, pensioners: 30, media: 30, eu: 30, activists: 30 };
    const base = regionCohorts(data, config, 'CZ010', anger, 50);
    for (const c of base) expect(c.support + c.neutral + c.anger).toBe(100);
    const angrier = regionCohorts(data, config, 'CZ010', { ...anger, media: 60 }, 50);
    expect(angrier.find((c) => c.group === 'media')!.anger).toBeGreaterThan(base.find((c) => c.group === 'media')!.anger);
    const liked = regionCohorts(data, config, 'CZ010', anger, 80);
    expect(liked.find((c) => c.group === 'eu')!.support).toBeGreaterThan(base.find((c) => c.group === 'eu')!.support);
    // a university kraj has more angry activists than a kraj without the trait, at the same national anger
    const uni = Object.entries(data.regionProfiles.regions).find(([, p]) => p.traits.includes('university'))![0];
    const plain = Object.entries(data.regionProfiles.regions).find(([, p]) => !p.traits.some((tr) => config.regions.groupAffinity[tr]?.activists))![0];
    const act = (code: string) => regionCohorts(data, config, code, anger, 50).find((c) => c.group === 'activists')!.anger;
    expect(act(uni)).toBeGreaterThan(act(plain));
  });
});
