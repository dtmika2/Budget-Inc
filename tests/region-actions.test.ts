import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { canDoRegionAction, offeredActions, regionActionPcCost } from '../src/core/regionActions';
import { quietSim } from './helpers';

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
});
