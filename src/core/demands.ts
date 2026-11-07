/**
 * Regional demands (map pins) and pledges (phase 14). A party from the region's coalition or an interest
 * group asks for something in a region. Accept -> a pledge with a one-year deadline, fulfilled by a
 * matching policy card, a compromise that helps the region, or a budget slider; reject -> onReject;
 * ignore (pin expires) -> onReject x ignoreFactor. Uses its own RNG stream (`demands`).
 */
import { scaleBundle } from './compromise';
import { applyBundle } from './effects';
import { scalar, worsensBalance } from './modifiers';
import { removeWhere, schedule } from './scheduler';
import { hasPassive } from './regionPassives';
import type { Simulation } from './simulation';
import type { DemandTemplate, Deltas, EffectBundle, FulfilCondition, OpenDemand, Pledge, Range, Requester, ScheduledEntry } from './types';
import { GROUP_IDS } from './types';

const yearDays = (sim: Simulation) => 4 * sim.cfg.time.daysPerQuarter;
const deadlineDays = (sim: Simulation) => sim.cfg.demands.deadlineQuarters * sim.cfg.time.daysPerQuarter;

/** At each year-start quarter: perYear spawn days inside the year (demands stream). */
export function scheduleYearDemands(sim: Simulation): void {
  const { cfg, state, data } = sim;
  const d = cfg.demands;
  if (d.perYear <= 0 || data.demands.length === 0 || !cfg.time.yearStartQuarters.includes(state.quarter)) return;
  const start = sim.absDayOf(state.quarter, 1);
  const lastDay = sim.absDayOf(cfg.time.quarters, cfg.time.daysPerQuarter);
  const from = start + d.spawnFromDay;
  const to = Math.min(start + yearDays(sim) - d.spawnBeforeYearEnd, lastDay - d.responseDays);
  if (to < from) return;
  for (let i = 0; i < d.perYear; i++) schedule(state, 'demandSpawn', sim.demandRng().int(from, to), {});
}

/** Replace the "self" region key by the demand's region. */
export function resolveSelf(b: EffectBundle, region: string): EffectBundle {
  if (!b.regions || !('self' in b.regions)) return b;
  const regions = { ...b.regions };
  const self = regions.self!;
  delete regions.self;
  // a bundle that also names the chosen kraj itself gets both (Tramvaj into Praha: +8 and +2)
  const own = regions[region];
  regions[region] = own ? { min: own.min + self.min, max: own.max + self.max } : self;
  return { ...b, regions };
}

/** Only the good parts of a bundle: gains, calmer groups, balance-improving budget changes, +PC. */
export function positiveOnly(b: EffectBundle): EffectBundle {
  const up = (r: Range): Range | null => (r.max > 0 ? { min: Math.max(0, r.min), max: r.max } : null);
  const down = (r: Range): Range | null => (r.min < 0 ? { min: r.min, max: Math.min(0, r.max) } : null);
  const keep = <K extends string>(o: Partial<Record<K, Range>> | undefined, f: (r: Range) => Range | null) => {
    const out: Partial<Record<K, Range>> = {};
    for (const [k, r] of Object.entries(o ?? {}) as [K, Range][]) {
      const v = f(r);
      if (v) out[k] = v;
    }
    return out;
  };
  return {
    ...b,
    effects: keep(b.effects, up),
    anger: keep(b.anger, down),
    regions: keep(b.regions, up) as Record<string, Range>,
    budgetChanges: b.budgetChanges?.filter((bc) => !worsensBalance(bc)),
    ongoing: b.ongoing?.filter((o) => (o.target.startsWith('anger.') ? o.perDay < 0 : o.perDay > 0)),
    pc: b.pc && b.pc > 0 ? b.pc : undefined,
  };
}

/** A demand outcome for its requester: party proposals only help while Microbossing runs (party.positiveOnly). */
export function forRequester(sim: Simulation, b: EffectBundle, requester: Requester | undefined): EffectBundle {
  return requester?.type === 'party' && scalar(sim.pipeline(), 'party.positiveOnly', 0) > 0 ? positiveOnly(b) : b;
}

const busyRegions = (sim: Simulation) => new Set([...sim.state.demands.map((d) => d.region), ...sim.state.pledges.map((p) => p.region)]);

/** Could this condition be met between `fromAbs` and `toAbs` (inclusive)? */
export function conditionFeasible(sim: Simulation, c: FulfilCondition, region: string, fromAbs: number, toAbs: number): boolean {
  if (c.type === 'policy') return sim.cards.some((card) => cardMatches(c, card.id, card.tags));
  if (c.type === 'compromise') {
    if (sim.cfg.compromise.chance <= 0) return false;
    const code = c.region === 'self' ? region : c.region;
    return sim.compromises.some((comp) => (comp.regions?.[code]?.max ?? 0) >= c.minRegionGain);
  }
  if (!sim.cfg.budgetVote.enabled || !sim.data.budgetItems.some((i) => i.id === c.item)) return false;
  const { minSteps, maxSteps } = sim.cfg.budgetVote.sliders;
  if (c.minSteps > maxSteps || c.minSteps < minSteps) return false;
  return sim.cfg.budgetVote.quarters.some((q) => {
    const abs = sim.absDayOf(q, sim.cfg.budgetVote.day);
    return abs > fromAbs && abs <= toAbs;
  });
}

function cardMatches(c: Extract<FulfilCondition, { type: 'policy' }>, cardId: string, tags: readonly string[] | undefined): boolean {
  return !!c.cardIds?.includes(cardId) || !!c.tags?.some((t) => tags?.includes(t));
}

function pickRequester(sim: Simulation, tpl: DemandTemplate, region: string): Requester | null {
  const rng = sim.demandRng();
  const options: Requester[] = [];
  if (tpl.requesterTypes.includes('party')) {
    const coalition = sim.data.regionProfiles.regions[region]?.coalition.parties ?? [];
    // regional coalitions are TODO until filled from official sources: fall back to the template's parties
    const pool = coalition.length ? coalition.filter((p) => !tpl.parties.length || tpl.parties.includes(p)) : tpl.parties;
    for (const id of pool) options.push({ type: 'party', id });
  }
  if (tpl.requesterTypes.includes('interestGroup')) {
    const groups = tpl.interestGroups.length ? tpl.interestGroups : [...GROUP_IDS];
    for (const id of groups) options.push({ type: 'interestGroup', id });
  }
  return options.length ? rng.pick(options) : null;
}

export function spawnDemand(sim: Simulation): void {
  const { state, data, cfg } = sim;
  const d = cfg.demands;
  if (state.demands.length >= d.maxOpen) {
    sim.log('demand_skipped', { reason: 'maxOpen' });
    return;
  }
  const rng = sim.demandRng();
  const busy = busyRegions(sim);
  const now = sim.absDay;
  const lastDay = sim.absDayOf(cfg.time.quarters, cfg.time.daysPerQuarter);
  const toAbs = Math.min(now + d.responseDays + deadlineDays(sim), lastDay);
  // templates in a random order; take the first with a region, a requester and a feasible condition
  const order = data.demands.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const ti of order) {
    const tpl = data.demands[ti];
    // a kraj under a noDemands passive (kraj action) is left alone
    const regions = data.regions.regions.filter((r) => !busy.has(r.code) && !hasPassive(sim, r.code, 'noDemands') && (!tpl.regions.length || tpl.regions.includes(r.code)));
    const weights = regions.map((r) => {
      let w = r.seats;
      for (const tr of data.regionProfiles.regions[r.code]?.traits ?? []) w *= tpl.regionWeights[tr] ?? 1;
      return w;
    });
    const feasible = regions.filter((r, i) => weights[i] > 0 && tpl.fulfil.some((c) => conditionFeasible(sim, c, r.code, now, toAbs)));
    if (!feasible.length) continue;
    const fw = feasible.map((r) => weights[regions.indexOf(r)]);
    const region = feasible[rng.weightedIndex(fw)].code;
    const requester = pickRequester(sim, tpl, region);
    if (!requester) continue;
    const demand: OpenDemand = { id: `dem${state.demandSeq++}`, templateId: tpl.id, region, requester, spawnAbsDay: now, expireAbsDay: now + d.responseDays };
    state.demands.push(demand);
    schedule(state, 'demandExpire', demand.expireAbsDay, { demandId: demand.id });
    sim.log('demand_spawned', { demandId: demand.id, templateId: tpl.id, region, requester: { ...requester } });
    return;
  }
  sim.log('demand_skipped', { reason: 'noFeasibleTemplate' });
}

export const templateOf = (sim: Simulation, id: string) => sim.data.demands.find((t) => t.id === id)!;

export function canAnswerDemand(sim: Simulation, demandId: string): string | null {
  if (sim.state.phase !== 'running') return 'not running';
  return sim.state.demands.some((d) => d.id === demandId) ? null : 'no such demand';
}

function takeDemand(sim: Simulation, demandId: string): OpenDemand {
  const { state } = sim;
  const i = state.demands.findIndex((d) => d.id === demandId);
  const [demand] = state.demands.splice(i, 1);
  removeWhere(state, (e) => e.kind === 'demandExpire' && e.payload.demandId === demandId);
  return demand;
}

const base = (d: OpenDemand | Pledge) => ({ region: d.region, templateId: d.templateId, requester: { ...d.requester } });

export function acceptDemand(sim: Simulation, demandId: string): void {
  const demand = takeDemand(sim, demandId);
  const tpl = templateOf(sim, demand.templateId);
  const { deltas } = applyBundle(sim, forRequester(sim, resolveSelf(tpl.onAccept, demand.region), demand.requester), 'demand', `demand:${tpl.id}`, sim.rng.effects);
  const pledge: Pledge = {
    id: `pl${demand.id.slice(3)}`,
    templateId: tpl.id,
    region: demand.region,
    requester: demand.requester,
    acceptedAbsDay: sim.absDay,
    deadlineAbsDay: sim.absDay + deadlineDays(sim),
  };
  sim.state.pledges.push(pledge);
  sim.log('demand_accepted', { demandId, pledgeId: pledge.id, deadlineAbsDay: pledge.deadlineAbsDay, ...base(demand) }, deltas);
}

export function rejectDemand(sim: Simulation, demandId: string): void {
  const demand = takeDemand(sim, demandId);
  const tpl = templateOf(sim, demand.templateId);
  const { deltas } = applyBundle(sim, forRequester(sim, resolveSelf(tpl.onReject, demand.region), demand.requester), 'demand', `demand:${tpl.id}`, sim.rng.effects);
  sim.log('demand_rejected', { demandId, ...base(demand) }, deltas);
}

export function expireDemand(sim: Simulation, entry: ScheduledEntry): void {
  const { state, cfg } = sim;
  const i = state.demands.findIndex((d) => d.id === entry.payload.demandId);
  if (i < 0) return;
  const [demand] = state.demands.splice(i, 1);
  const tpl = templateOf(sim, demand.templateId);
  const f = cfg.demands.ignoreFactor;
  const { deltas } = applyBundle(sim, scaleBundle(forRequester(sim, resolveSelf(tpl.onReject, demand.region), demand.requester), f, f), 'demand', `demand:${tpl.id}`, sim.rng.effects);
  sim.log('demand_ignored', { demandId: demand.id, ...base(demand) }, deltas);
}

function fulfil(sim: Simulation, pledge: Pledge, by: Record<string, unknown>): void {
  const tpl = templateOf(sim, pledge.templateId);
  sim.state.pledges = sim.state.pledges.filter((p) => p.id !== pledge.id);
  const { deltas } = applyBundle(sim, forRequester(sim, resolveSelf(tpl.onFulfil, pledge.region), pledge.requester), 'demand', `pledge:${tpl.id}`, sim.rng.effects);
  sim.log('pledge_fulfilled', { pledgeId: pledge.id, ...base(pledge), by }, deltas);
}

/** Conditions of a pledge's template. */
const conditions = (sim: Simulation, p: Pledge) => templateOf(sim, p.templateId).fulfil;

/** After a policy pick. */
export function checkPledgesPolicy(sim: Simulation, cardId: string): void {
  const card = sim.cardById.get(cardId);
  for (const p of [...sim.state.pledges])
    if (conditions(sim, p).some((c) => c.type === 'policy' && cardMatches(c, cardId, card?.tags))) fulfil(sim, p, { type: 'policy', cardId });
}

/** After a compromise: the applied regional deltas decide. */
export function checkPledgesCompromise(sim: Simulation, cardId: string, deltas: Deltas | undefined): void {
  for (const p of [...sim.state.pledges]) {
    const ok = conditions(sim, p).some((c) => {
      if (c.type !== 'compromise') return false;
      const code = c.region === 'self' ? p.region : c.region;
      return (deltas?.regions?.[code] ?? 0) >= c.minRegionGain;
    });
    if (ok) fulfil(sim, p, { type: 'compromise', cardId });
  }
}

export function budgetConditionMet(c: Extract<FulfilCondition, { type: 'budget' }>, sliders: Record<string, number>): boolean {
  const v = sliders[c.item] ?? 0;
  return c.minSteps > 0 ? v >= c.minSteps : v <= c.minSteps;
}

/** After a budget vote (only a passed vote counts). */
export function checkPledgesBudget(sim: Simulation, sliders: Record<string, number>, passed: boolean): void {
  if (!passed) return;
  for (const p of [...sim.state.pledges])
    if (conditions(sim, p).some((c) => c.type === 'budget' && budgetConditionMet(c, sliders))) fulfil(sim, p, { type: 'budget' });
}

/** Daily: pledges past their deadline fail (onFail exactly once). */
export function checkPledgeDeadlines(sim: Simulation): void {
  const now = sim.absDay;
  for (const p of [...sim.state.pledges]) {
    if (now <= p.deadlineAbsDay) continue;
    const tpl = templateOf(sim, p.templateId);
    sim.state.pledges = sim.state.pledges.filter((x) => x.id !== p.id);
    const { deltas } = applyBundle(sim, forRequester(sim, resolveSelf(tpl.onFail, p.region), p.requester), 'demand', `pledge:${tpl.id}`, sim.rng.effects);
    sim.log('pledge_failed', { pledgeId: p.id, ...base(p) }, deltas);
  }
}

/** Active pledges a policy card would fulfil (UI badge, draft boost). */
export function pledgesForCard(sim: Simulation, cardId: string): Pledge[] {
  const card = sim.cardById.get(cardId);
  if (!card) return [];
  return sim.state.pledges.filter((p) => conditions(sim, p).some((c) => c.type === 'policy' && cardMatches(c, cardId, card.tags)));
}

/** Active pledges a compromise could fulfil (its best case reaches the required regional gain). */
export function pledgesForCompromise(sim: Simulation, cardId: string): Pledge[] {
  const comp = sim.compromiseById.get(cardId);
  if (!comp) return [];
  return sim.state.pledges.filter((p) =>
    conditions(sim, p).some((c) => c.type === 'compromise' && (comp.regions?.[c.region === 'self' ? p.region : c.region]?.max ?? 0) >= c.minRegionGain),
  );
}

/** Budget item -> pledges it can fulfil, with the required steps. */
export function pledgesForBudget(sim: Simulation): { item: string; minSteps: number; pledge: Pledge }[] {
  const out: { item: string; minSteps: number; pledge: Pledge }[] = [];
  for (const p of sim.state.pledges) for (const c of conditions(sim, p)) if (c.type === 'budget') out.push({ item: c.item, minSteps: c.minSteps, pledge: p });
  return out;
}
