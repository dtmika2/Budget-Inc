/**
 * Regional compromise decision ("ucinit kompromis"): separate from the policy draft. In a quarter it
 * occurs (config.compromise.chance, rolled at quarter start), the game pauses on config.compromise.day and
 * offers `choices` compromise cards against each other; the player must pick one.
 *
 * Phase 12: the player then sells the deal through a channel (press release, TV debate, regional tour).
 * The channel's mini-game runs in the UI only; the core receives its score (0..1) and scales the deal:
 * gains x gainMult, losses x lossMult (see config.compromise.channels).
 */
import type { CompromiseChannel } from '../config';
import { scheduleChaosForPick } from './chaos';
import { checkPledgesCompromise, pledgesForCompromise } from './demands';
import { drawCompromises } from './draft';
import { applyBundle } from './effects';
import { worsensBalance } from './modifiers';
import { schedule } from './scheduler';
import type { Simulation } from './simulation';
import type { EffectBundle, GroupId, Range } from './types';

export function scheduleQuarterCompromise(sim: Simulation): void {
  const c = sim.cfg.compromise;
  if (c.chance <= 0 || sim.compromises.length < 2) return;
  if (sim.rng.regions.next() >= c.chance) return;
  schedule(sim.state, 'compromise', sim.absDayOf(sim.state.quarter, Math.min(c.day, sim.cfg.time.daysPerQuarter)), {});
}

/** Opens the decision (phase 'compromise'); returns false if too few compromises are available. */
export function openCompromise(sim: Simulation): boolean {
  const { state, cfg } = sim;
  const boost = (c: { id: string }) => (pledgesForCompromise(sim, c.id).length ? cfg.demands.draftBoost : 1);
  const offer = drawCompromises(sim.compromises, state.picked, state.quarter, cfg.compromise.cooldownQuarters, cfg.compromise.choices, sim.rng.regions, boost);
  if (offer.length < 2) {
    sim.log('compromise_skipped', { available: offer.length });
    return false;
  }
  state.compromiseOffer = offer;
  state.phase = 'compromise';
  sim.log('compromise_offered', { cards: offer });
  return true;
}

/** Game year of a quarter: Q1-4 -> 1, Q5-8 -> 2, ... */
export const yearOf = (quarter: number) => Math.ceil(quarter / 4);

/** Score rounded to 2 decimals and clamped to [0, 1] (what the core uses and logs). */
export const normScore = (score: number) => Math.min(1, Math.max(0, Math.round(score * 100) / 100));

/** Piecewise linear through (0, atZero), (neutral, 1), (1, atOne). */
export function scoreMult(score: number, atZero: number, atOne: number, neutral: number): number {
  const s = normScore(score);
  if (neutral <= 0) return 1 + (atOne - 1) * s;
  if (neutral >= 1) return atZero + (1 - atZero) * s;
  return s <= neutral ? atZero + ((1 - atZero) * s) / neutral : 1 + ((atOne - 1) * (s - neutral)) / (1 - neutral);
}

export function channelMults(sim: Simulation, channelId: string, score: number): { gainMult: number; lossMult: number } {
  const ch = sim.cfg.compromise.channels[channelId];
  const n = sim.cfg.compromise.neutralScore;
  return { gainMult: scoreMult(score, ch.gainAtZero, ch.gainAtOne, n), lossMult: scoreMult(score, ch.lossAtZero, ch.lossAtOne, n) };
}

/** Channel availability: null if usable now, else a reason. */
export function channelBlocked(sim: Simulation, channelId: string): string | null {
  const ch: CompromiseChannel | undefined = sim.cfg.compromise.channels[channelId];
  if (!ch) return 'no such channel';
  if (ch.oncePerYear && sim.state.tourUsedInYear === yearOf(sim.state.quarter)) return 'channel already used this year';
  return null;
}

/**
 * Scale a bundle: good values x gainMult, bad values x lossMult. Good = resource / regional gain, anger
 * drop, budget change that improves the balance. Range ends are scaled separately and re-ordered.
 */
export function scaleBundle(b: EffectBundle, gainMult: number, lossMult: number): EffectBundle {
  const good = (v: number) => v * (v >= 0 ? gainMult : lossMult);
  const bad = (v: number) => v * (v <= 0 ? gainMult : lossMult); // anger: negative = good
  const range = (r: Range, f: (v: number) => number): Range => {
    const a = f(r.min);
    const c = f(r.max);
    return { min: Math.min(a, c), max: Math.max(a, c) };
  };
  const out: EffectBundle = {};
  if (b.effects) out.effects = Object.fromEntries(Object.entries(b.effects).map(([k, r]) => [k, range(r!, good)]));
  if (b.anger) out.anger = Object.fromEntries(Object.entries(b.anger).map(([k, r]) => [k, range(r!, bad)])) as Partial<Record<GroupId, Range>>;
  if (b.regions) out.regions = Object.fromEntries(Object.entries(b.regions).map(([k, r]) => [k, range(r!, good)]));
  if (b.budgetChanges)
    out.budgetChanges = b.budgetChanges.map((bc) => ({ ...bc, changePct: bc.changePct * (worsensBalance(bc) ? lossMult : gainMult) }));
  if (b.ongoing) out.ongoing = b.ongoing.map((o) => ({ ...o, perDay: o.target.startsWith('anger.') ? bad(o.perDay) : good(o.perDay) }));
  if (b.pc) out.pc = b.pc;
  return out;
}

/** The deal as it will be applied for a channel and score. */
export function soldBundle(sim: Simulation, cardId: string, channelId: string, score: number): EffectBundle {
  const comp = sim.compromiseById.get(cardId)!;
  const { gainMult, lossMult } = channelMults(sim, channelId, score);
  return scaleBundle(comp, gainMult, lossMult);
}

export function canMakeCompromise(sim: Simulation, cardId: string, channelId: string, score: number): string | null {
  if (sim.state.phase !== 'compromise' || !sim.state.compromiseOffer) return 'no compromise open';
  if (!sim.state.compromiseOffer.includes(cardId)) return 'card not offered';
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) return 'score must be within 0..1';
  return channelBlocked(sim, channelId);
}

export function makeCompromise(sim: Simulation, cardId: string, channelId: string, rawScore: number): void {
  const { state } = sim;
  const comp = sim.compromiseById.get(cardId)!;
  const score = normScore(rawScore);
  const rejected = state.compromiseOffer!.filter((id) => id !== cardId);
  const { gainMult, lossMult } = channelMults(sim, channelId, score);
  const bundle = scaleBundle(comp, gainMult, lossMult);
  const { rolled, deltas } = applyBundle(sim, bundle, 'compromise', `compromise:${comp.id}`, sim.rng.effects);
  if (sim.cfg.compromise.channels[channelId].oncePerYear) state.tourUsedInYear = yearOf(state.quarter);
  state.picked.push({ cardId: comp.id, quarter: state.quarter });
  state.compromiseOffer = null;
  state.phase = 'running';
  sim.log('compromise_made', { cardId: comp.id, rejected, channelId, score, gainMult, lossMult, rolled }, deltas);
  checkPledgesCompromise(sim, comp.id, deltas);
  scheduleChaosForPick(sim, comp);
}
