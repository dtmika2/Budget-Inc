/** Opportunity pins on the map (spec §7.4). */
import { applyBundle } from './effects';
import { removeWhere, schedule } from './scheduler';
import type { Simulation } from './simulation';
import type { ScheduledEntry } from './types';

/** At the start of each quarter: N pins, each on a random day, a region by seat weight, a reward by weight. */
export function scheduleQuarterPins(sim: Simulation): void {
  const { cfg, data, state } = sim;
  const o = cfg.opportunities;
  if (o.perQuarter <= 0 || data.opportunities.length === 0) return;
  const rng = sim.rng.opportunities;
  const regions = data.regions.regions;
  const regionWeights = regions.map((r) => r.seats);
  const oppWeights = data.opportunities.map((x) => x.weight);
  for (let i = 0; i < o.perQuarter; i++) {
    const day = rng.int(o.spawnFromDay, Math.min(o.spawnToDay, cfg.time.daysPerQuarter));
    const region = regions[rng.weightedIndex(regionWeights)].code;
    const opportunityId = data.opportunities[rng.weightedIndex(oppWeights)].id;
    schedule(state, 'pinSpawn', sim.absDayOf(state.quarter, day), { region, opportunityId });
  }
}

export function spawnPin(sim: Simulation, entry: ScheduledEntry): void {
  const { state, cfg } = sim;
  const id = `pin${state.pinSeq++}`;
  const expireAbsDay = sim.absDay + cfg.opportunities.lifetimeDays;
  state.pins.push({
    id,
    region: String(entry.payload.region),
    opportunityId: String(entry.payload.opportunityId),
    spawnAbsDay: sim.absDay,
    expireAbsDay,
  });
  schedule(state, 'pinExpire', expireAbsDay, { pinId: id });
  sim.log('opportunity_spawned', { pinId: id, region: entry.payload.region, opportunityId: entry.payload.opportunityId });
}

export function expirePin(sim: Simulation, entry: ScheduledEntry): void {
  const { state } = sim;
  const idx = state.pins.findIndex((p) => p.id === entry.payload.pinId);
  if (idx < 0) return;
  const [pin] = state.pins.splice(idx, 1);
  sim.log('opportunity_expired', { pinId: pin.id, opportunityId: pin.opportunityId, region: pin.region });
}

export function collectPin(sim: Simulation, pinId: string): void {
  const { state } = sim;
  const idx = state.pins.findIndex((p) => p.id === pinId);
  const [pin] = state.pins.splice(idx, 1);
  removeWhere(state, (e) => e.kind === 'pinExpire' && e.payload.pinId === pinId);
  const opp = sim.data.opportunities.find((o) => o.id === pin.opportunityId)!;
  const { rolled, deltas } = applyBundle(sim, opp.reward, 'opportunity', `opportunity:${opp.id}`, sim.rng.effects);
  sim.log('opportunity_collected', { pinId, opportunityId: opp.id, region: pin.region, rolled }, deltas);
}
