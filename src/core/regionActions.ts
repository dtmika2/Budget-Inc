/**
 * Kraj actions (P26, regions workspace; stakeholder feedback): instead of many random kraj events, the
 * player chooses where to work. Each kraj offers up to config.regionActions.offered actions, picked by the
 * kraj's traits (deterministic, no RNG), plus the `always` ones. An action costs Finances and/or PC (a negative
 * `pc` in its bundle) and raises support in that kraj. Limits: one action per kraj per year, at most
 * `perQuarter` actions in a quarter. An action may carry a passive (./regionPassives) that stays active in the kraj
 * for config.regionActions.passiveQuarters quarters; the weekly and quarterly ones are paid out here.
 */
import { resolveSelf } from './demands';
import { applyBundle } from './effects';
import { activePassives } from './regionPassives';
import type { Simulation } from './simulation';
import type { RegionActionTemplate } from './types';

/** Game year (1-4) of a quarter. */
const yearOf = (quarter: number) => Math.ceil(quarter / 4);

export const regionActionTemplate = (sim: Simulation, id: string): RegionActionTemplate | undefined =>
  sim.data.regionActions.find((a) => a.id === id);

/** PC an action costs (its bundle's negative pc). */
export const regionActionPcCost = (a: RegionActionTemplate) => Math.max(0, -(a.bundle.pc ?? 0));

/** The actions a kraj offers: the `always` ones plus the best-scoring others (score = base + trait weights). */
export function offeredActions(sim: Simulation, region: string): RegionActionTemplate[] {
  const traits = new Set(sim.data.regionProfiles.regions[region]?.traits ?? []);
  const score = (a: RegionActionTemplate) => a.base + Object.entries(a.regionWeights).reduce((s, [tr, w]) => s + (traits.has(tr) ? w : 0), 0);
  const always = sim.data.regionActions.filter((a) => a.always);
  const ranked = sim.data.regionActions
    .filter((a) => !a.always && score(a) > 0)
    .map((a, i) => ({ a, s: score(a), i }))
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .slice(0, Math.max(0, sim.cfg.regionActions.offered))
    .map((x) => x.a);
  return [...ranked, ...always];
}

/** Actions done this quarter, and whether the kraj already had its action this year. */
export function regionActionLimits(sim: Simulation, region: string): { thisQuarter: number; krajUsedThisYear: boolean } {
  const { state, cfg } = sim;
  const done = state.regionActionsDone;
  const year = yearOf(state.quarter);
  return {
    thisQuarter: done.filter((d) => d.quarter === state.quarter).length,
    krajUsedThisYear: done.filter((d) => d.region === region && yearOf(d.quarter) === year).length >= cfg.regionActions.perKrajPerYear,
  };
}

/** Null if the action can be done now, else a reason. */
export function canDoRegionAction(sim: Simulation, region: string, actionId: string): string | null {
  const { state, cfg } = sim;
  if (!cfg.regionActions.enabled) return 'region actions are off';
  if (state.phase !== 'running') return 'not running';
  if (!sim.data.regions.regions.some((r) => r.code === region)) return 'no such kraj';
  const a = offeredActions(sim, region).find((x) => x.id === actionId);
  if (!a) return 'action not offered in this kraj';
  const lim = regionActionLimits(sim, region);
  if (lim.krajUsedThisYear) return 'kraj already had an action this year';
  if (lim.thisQuarter >= cfg.regionActions.perQuarter) return 'no actions left this quarter';
  if (regionActionPcCost(a) > state.pc) return 'cannot afford action';
  return null;
}

/** The action's bundle in this kraj (`self` resolved). */
export const regionActionBundle = (a: RegionActionTemplate, region: string) => resolveSelf(a.bundle, region);

/** Weekly (with the projection): weeklySupport passives add their value to the kraj's support shift, capped like any shift. */
export function tickRegionPassivesWeekly(sim: Simulation): void {
  const cap = sim.cfg.regions.maxShift;
  for (const p of activePassives(sim)) {
    if (p.passive.type !== 'weeklySupport') continue;
    const before = sim.state.regionShift[p.region] ?? 0;
    sim.state.regionShift[p.region] = Math.min(cap, Math.max(-cap, before + p.passive.value));
  }
}

/** Quarter start: quarterlyFinances passives pay out in every quarter after the action's own one. */
export function payRegionPassivesQuarterly(sim: Simulation): void {
  for (const p of activePassives(sim)) {
    if (p.passive.type !== 'quarterlyFinances' || sim.state.quarter <= p.fromQuarter) continue;
    const v = p.passive.value;
    const { deltas } = applyBundle(sim, { effects: { financesExtra: { min: v, max: v } } }, 'region_action', `region_passive:${p.actionId}`, sim.rng.effects, true);
    sim.log('region_passive', { region: p.region, actionId: p.actionId }, deltas);
  }
}

export function doRegionAction(sim: Simulation, region: string, actionId: string): void {
  const a = regionActionTemplate(sim, actionId)!;
  const { deltas } = applyBundle(sim, regionActionBundle(a, region), 'region_action', `region_action:${a.id}`, sim.rng.effects);
  sim.state.regionActionsDone.push({ region, actionId, quarter: sim.state.quarter });
  sim.log('region_action', { region, actionId }, deltas);
}
