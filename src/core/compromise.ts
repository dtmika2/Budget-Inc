/**
 * Regional compromise decision ("ucinit kompromis"): separate from the policy draft. In a quarter it
 * occurs (config.compromise.chance, rolled at quarter start), the game pauses on config.compromise.day and
 * offers `choices` compromise cards against each other; the player must pick one.
 */
import { scheduleChaosForPick } from './chaos';
import { drawCompromises } from './draft';
import { applyBundle } from './effects';
import { schedule } from './scheduler';
import type { Simulation } from './simulation';

export function scheduleQuarterCompromise(sim: Simulation): void {
  const c = sim.cfg.compromise;
  if (c.chance <= 0 || sim.compromises.length < 2) return;
  if (sim.rng.regions.next() >= c.chance) return;
  schedule(sim.state, 'compromise', sim.absDayOf(sim.state.quarter, Math.min(c.day, sim.cfg.time.daysPerQuarter)), {});
}

/** Opens the decision (phase 'compromise'); returns false if too few compromises are available. */
export function openCompromise(sim: Simulation): boolean {
  const { state, cfg } = sim;
  const offer = drawCompromises(sim.compromises, state.picked, state.quarter, cfg.compromise.cooldownQuarters, cfg.compromise.choices, sim.rng.regions);
  if (offer.length < 2) {
    sim.log('compromise_skipped', { available: offer.length });
    return false;
  }
  state.compromiseOffer = offer;
  state.phase = 'compromise';
  sim.log('compromise_offered', { cards: offer });
  return true;
}

export function canMakeCompromise(sim: Simulation, cardId: string): string | null {
  if (sim.state.phase !== 'compromise' || !sim.state.compromiseOffer) return 'no compromise open';
  return sim.state.compromiseOffer.includes(cardId) ? null : 'card not offered';
}

export function makeCompromise(sim: Simulation, cardId: string): void {
  const { state } = sim;
  const comp = sim.compromiseById.get(cardId)!;
  const rejected = state.compromiseOffer!.filter((id) => id !== cardId);
  const { rolled, deltas } = applyBundle(sim, comp, 'compromise', `compromise:${comp.id}`, sim.rng.effects);
  state.picked.push({ cardId: comp.id, quarter: state.quarter });
  state.compromiseOffer = null;
  state.phase = 'running';
  sim.log('compromise_made', { cardId: comp.id, rejected, rolled }, deltas);
  scheduleChaosForPick(sim, comp);
}
