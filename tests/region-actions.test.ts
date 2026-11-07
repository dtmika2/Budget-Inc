import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { spawnDemand } from '../src/core/demands';
import { applyBundle, previewBundle } from '../src/core/effects';
import { canDoRegionAction, offeredActions, payRegionPassivesQuarterly, regionActionPcCost, tickRegionPassivesWeekly } from '../src/core/regionActions';
import { spawnRegionEvent } from '../src/core/regionEvents';
import { activePassives } from '../src/core/regionPassives';
import type { Simulation } from '../src/core/simulation';
import type { RegionPassive } from '../src/core/types';
import { quietSim } from './helpers';

/** The data action carrying a passive of this type. */
const withPassive = (sim: Simulation, type: RegionPassive['type']) => sim.data.regionActions.find((a) => a.passive?.type === type)!;
/** Mark the action done in a kraj this quarter (its passive starts now). */
const done = (sim: Simulation, region: string, actionId: string, quarter = sim.state.quarter) => sim.state.regionActionsDone.push({ region, actionId, quarter });

/** Kraj actions (P26, regions workspace): the player picks where to work. */
describe('kraj actions', () => {
  it('every kraj offers 2-4 actions, the always ones included, the same every time', () => {
    const sim = quietSim();
    for (const r of sim.data.regions.regions) {
      const a = offeredActions(sim, r.code);
      expect(a.length).toBeGreaterThanOrEqual(2);
      expect(a.length).toBeLessThanOrEqual(4);
      for (const x of sim.data.regionActions.filter((y) => y.always)) expect(a).toContain(x);
      expect(offeredActions(sim, r.code).map((x) => x.id)).toEqual(a.map((x) => x.id));
    }
  });

  it('applies exactly what the preview shows in that kraj and logs it', () => {
    const sim = quietSim({ seed: 'act' });
    const r = sim.data.regions.regions[0].code;
    const a = offeredActions(sim, r).find((x) => regionActionPcCost(x) === 0)!;
    const p = sim.previewRegionAction(a.id, r);
    const shift0 = sim.state.regionShift[r];
    expect(sim.dispatch({ kind: 'regionAction', region: r, actionId: a.id }).ok).toBe(true);
    const d = sim.state.regionShift[r] - shift0;
    expect(d).toBeGreaterThanOrEqual(p.regions[r]!.min - 1e-9);
    expect(d).toBeLessThanOrEqual(p.regions[r]!.max + 1e-9);
    const log = sim.state.log.filter((l) => l.type === 'region_action');
    expect(log).toHaveLength(1);
    expect(log[0].region).toBe(r);
  });

  it('one action per kraj per year, at most perQuarter per quarter, and PC must cover the cost', () => {
    const sim = quietSim({ seed: 'limits' });
    const codes = sim.data.regions.regions.map((r) => r.code);
    const free = (code: string) => offeredActions(sim, code).find((x) => regionActionPcCost(x) === 0)!.id;
    expect(sim.dispatch({ kind: 'regionAction', region: codes[0], actionId: free(codes[0]) }).ok).toBe(true);
    // same kraj again this year
    expect(canDoRegionAction(sim, codes[0], free(codes[0]))).toMatch(/this year/);
    for (let i = 1; i < config.regionActions.perQuarter; i++) expect(sim.dispatch({ kind: 'regionAction', region: codes[i], actionId: free(codes[i]) }).ok).toBe(true);
    const next = codes[config.regionActions.perQuarter];
    expect(canDoRegionAction(sim, next, free(next))).toMatch(/quarter/);
    // a PC action without PC
    const sim2 = quietSim({ seed: 'pc' });
    sim2.state.pc = 0;
    const paid = offeredActions(sim2, codes[1]).find((x) => regionActionPcCost(x) > 0)!;
    expect(canDoRegionAction(sim2, codes[1], paid.id)).toMatch(/afford/);
    // an action the kraj does not offer
    const notOffered = sim2.data.regionActions.find((x) => !offeredActions(sim2, codes[1]).includes(x));
    if (notOffered) expect(canDoRegionAction(sim2, codes[1], notOffered.id)).toMatch(/not offered/);
  });

  it('the kraj can act again the next year', () => {
    const sim = quietSim({ seed: 'year' });
    const r = sim.data.regions.regions[2].code;
    const id = offeredActions(sim, r).find((x) => regionActionPcCost(x) === 0)!.id;
    sim.state.regionActionsDone.push({ region: r, actionId: id, quarter: 1 });
    sim.state.quarter = 5;
    expect(canDoRegionAction(sim, r, id)).toBeNull();
  });

  it('every data action carries a passive', () => {
    const sim = quietSim();
    for (const a of sim.data.regionActions) expect(a.passive, a.id).toBeDefined();
  });

  it('a passive lasts passiveQuarters quarters from the action', () => {
    const sim = quietSim({ seed: 'pas-len' });
    const r = sim.data.regions.regions[0].code;
    done(sim, r, withPassive(sim, 'noDemands').id, 1);
    for (let q = 1; q <= config.regionActions.passiveQuarters; q++) {
      sim.state.quarter = q;
      expect(activePassives(sim, r)).toHaveLength(1);
    }
    sim.state.quarter = config.regionActions.passiveQuarters + 1;
    expect(activePassives(sim, r)).toHaveLength(0);
  });

  it('noDemands keeps demands out of the kraj', () => {
    const sim = quietSim({ seed: 'pas-dem' });
    const codes = sim.data.regions.regions.map((r) => r.code);
    const id = withPassive(sim, 'noDemands').id;
    for (const c of codes.slice(1)) done(sim, c, id);
    for (let i = 0; i < 6; i++) {
      spawnDemand(sim);
      for (const d of sim.state.demands) expect(d.region).toBe(codes[0]);
      sim.state.demands = [];
    }
    done(sim, codes[0], id);
    spawnDemand(sim);
    expect(sim.state.demands).toHaveLength(0);
  });

  it('noRegionEvents keeps region events out of the kraj', () => {
    const sim = quietSim({ seed: 'pas-ev' });
    const id = withPassive(sim, 'noRegionEvents').id;
    for (const r of sim.data.regions.regions) done(sim, r.code, id);
    spawnRegionEvent(sim, { seq: 0, kind: 'regionEventSpawn', absDay: sim.absDay, payload: {} });
    expect(sim.state.regionEvents).toHaveLength(0);
    sim.state.regionActionsDone = [];
    spawnRegionEvent(sim, { seq: 0, kind: 'regionEventSpawn', absDay: sim.absDay, payload: {} });
    expect(sim.state.regionEvents).toHaveLength(1);
  });

  it('weeklySupport adds its value every week while active', () => {
    const sim = quietSim({ seed: 'pas-week' });
    const r = sim.data.regions.regions[3].code;
    const a = withPassive(sim, 'weeklySupport');
    done(sim, r, a.id);
    const before = sim.state.regionShift[r];
    tickRegionPassivesWeekly(sim);
    expect(sim.state.regionShift[r] - before).toBeCloseTo(a.passive!.type === 'weeklySupport' ? a.passive!.value : 0);
    sim.state.quarter += config.regionActions.passiveQuarters;
    const later = sim.state.regionShift[r];
    tickRegionPassivesWeekly(sim);
    expect(sim.state.regionShift[r]).toBe(later);
  });

  it('quarterlyFinances pays at the start of each later quarter, not in the action quarter', () => {
    const sim = quietSim({ seed: 'pas-fin' });
    const r = sim.data.regions.regions[4].code;
    const a = withPassive(sim, 'quarterlyFinances');
    const value = a.passive!.type === 'quarterlyFinances' ? a.passive!.value : 0;
    done(sim, r, a.id);
    const f0 = sim.state.financesExtra;
    payRegionPassivesQuarterly(sim);
    expect(sim.state.financesExtra).toBe(f0);
    sim.state.quarter += 1;
    payRegionPassivesQuarterly(sim);
    expect(sim.state.financesExtra - f0).toBeCloseTo(value);
    expect(sim.state.log.at(-1)?.type).toBe('region_passive');
  });

  it('shieldLosses scales losses in the kraj, in the preview too, and leaves gains alone', () => {
    const sim = quietSim({ seed: 'pas-shield' });
    const r = sim.data.regions.regions[5].code;
    const a = withPassive(sim, 'shieldLosses');
    const m = a.passive!.type === 'shieldLosses' ? a.passive!.value : 1;
    const loss = { regions: { [r]: { min: -4, max: -4 } } };
    const plain = previewBundle(sim, loss, 'chaos').regions[r]!;
    done(sim, r, a.id);
    const shielded = previewBundle(sim, loss, 'chaos').regions[r]!;
    expect(shielded.min).toBeCloseTo(plain.min * m);
    const before = sim.state.regionShift[r];
    applyBundle(sim, loss, 'chaos', 'test', sim.rng.effects, true);
    expect(sim.state.regionShift[r] - before).toBeCloseTo(plain.min * m);
    const gain = { regions: { [r]: { min: 3, max: 3 } } };
    expect(previewBundle(sim, gain, 'chaos').regions[r]!.min).toBeGreaterThan(0);
  });
});
