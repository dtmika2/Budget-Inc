/**
 * Leader abilities (spec §5.2, phase 17): every leader has three, each usable once per game. An ability is
 * data: modifiers (usually for 12 "months"), an instant bundle, optional monthly pulses, and optionally an
 * action: cancelEvent (Durazne odsouzeni: cancel one open item without its effects) or halveAnger (STB:
 * halve one group's anger, plus modifiers on that group).
 */
import { applyBundle } from './effects';
import { instantiate } from './modifiers';
import { removeWhere, schedule } from './scheduler';
import type { Simulation } from './simulation';
import type { AbilityDef, EffectBundle, GroupId, Range, ScheduledEntry } from './types';
import { GROUP_IDS } from './types';

export const abilityOf = (sim: Simulation, id: string): AbilityDef | undefined => sim.leaderDef.abilities.find((a) => a.id === id);

/** One item the cancelEvent action can cancel; `target` is what the input carries. */
export interface CondemnTarget {
  target: string;
  kind: 'regionEvent' | 'demand' | 'response' | 'ongoing';
  /** Region event / demand template, chaos event id, or the ongoing effect's label key. */
  ref: string;
  region?: string;
}

/** Everything currently happening that Durazne odsouzeni can cancel. */
export function condemnTargets(sim: Simulation): CondemnTarget[] {
  const s = sim.state;
  return [
    ...s.regionEvents.map((e) => ({ target: `regionEvent:${e.id}`, kind: 'regionEvent' as const, ref: e.templateId, region: e.region })),
    ...s.demands.map((d) => ({ target: `demand:${d.id}`, kind: 'demand' as const, ref: d.templateId, region: d.region })),
    ...s.pendingResponses.map((p) => ({ target: `response:${p.instanceId}`, kind: 'response' as const, ref: p.eventId })),
    ...s.ongoing
      .filter((o) => o.source === 'chaos' || o.source === 'response' || o.source === 'special')
      .map((o) => ({ target: `ongoing:${o.key}`, kind: 'ongoing' as const, ref: o.label ?? o.origin })),
  ];
}

export function canUseAbility(sim: Simulation, abilityId: string, target?: string): string | null {
  const a = abilityOf(sim, abilityId);
  if (!a) return 'no such ability';
  if (sim.state.abilitiesUsed.includes(abilityId)) return 'already used';
  if (sim.state.phase !== 'running' && sim.state.phase !== 'draft') return 'not now';
  if (a.action === 'cancelEvent' && !condemnTargets(sim).some((c) => c.target === target)) return 'nothing to cancel';
  if (a.action === 'halveAnger' && !(GROUP_IDS as readonly string[]).includes(target ?? '')) return 'choose a group';
  return null;
}

export function activateAbility(sim: Simulation, abilityId: string, target?: string): void {
  const { state, cfg } = sim;
  const a = abilityOf(sim, abilityId)!;
  const origin = `ability:${a.id}`;
  state.abilitiesUsed.push(a.id);
  // the instant bundle first, so the ability's own modifiers do not scale it (Kmotri: exactly -20)
  const { rolled, deltas } = applyBundle(sim, a.bundle, 'ability', origin, sim.rng.effects);
  state.modifiers.push(...instantiate(a.modifiers, origin));
  if (a.action === 'halveAnger') {
    const g = target as GroupId;
    state.modifiers.push(...instantiate(a.targetModifiers.map((m) => ({ ...m, target: m.target.replace('{group}', g) })), origin));
  }
  if (a.action === 'halveAnger') {
    const g = target as GroupId;
    const cut = state.anger[g] / 2;
    state.anger[g] -= cut;
    deltas.anger[g] = (deltas.anger[g] ?? 0) - cut;
  }
  if (a.blame) state.blame = { left: a.blame.policies, coalitionFactor: a.blame.coalitionFactor, origin };
  if (a.pulses) {
    const last = sim.absDayOf(cfg.time.quarters, cfg.time.daysPerQuarter);
    for (let n = 1; n <= a.pulses.times; n++) {
      const day = sim.absDay + n * a.pulses.everyDays;
      if (day <= last) schedule(state, 'abilityPulse', day, { abilityId: a.id, n });
    }
  }
  sim.log('ability_used', { abilityId: a.id, target: target ?? null, rolled }, deltas);
  if (a.action === 'cancelEvent' && target) cancelTarget(sim, target);
}

/**
 * A policy bundle with the STB blame applied: Support and Prestige losses are dropped (the gain part of a
 * range stays) and Coalition loses coalitionFactor x those losses instead. `blamed` is false when the card
 * has no such loss (then it does not use up a blamed policy).
 */
export function blamedBundle(sim: Simulation, bundle: EffectBundle): { bundle: EffectBundle; blamed: boolean } {
  const b = sim.state.blame;
  if (!b || b.left <= 0) return { bundle, blamed: false };
  const effects = { ...(bundle.effects ?? {}) };
  let lossMin = 0;
  let lossMax = 0;
  for (const r of ['support', 'prestige'] as const) {
    const x = effects[r];
    if (!x || x.min >= 0) continue;
    // the loss part of the range: [min, min(max, 0)]
    lossMin += x.min;
    lossMax += Math.min(x.max, 0);
    effects[r] = { min: Math.max(0, x.min), max: Math.max(0, x.max) };
    if (effects[r]!.max === 0) delete effects[r];
  }
  if (lossMin === 0 && lossMax === 0) return { bundle, blamed: false };
  const f = b.coalitionFactor;
  const c: Range | undefined = effects.coalition;
  // a bigger loss is a lower value: min pairs with min
  effects.coalition = { min: (c?.min ?? 0) + f * lossMin, max: (c?.max ?? 0) + f * lossMax };
  return { bundle: { ...bundle, effects }, blamed: true };
}

/** A scheduled monthly pulse of an ability. */
export function firePulse(sim: Simulation, entry: ScheduledEntry): void {
  const a = abilityOf(sim, String(entry.payload.abilityId));
  if (!a?.pulses) return;
  const { rolled, deltas } = applyBundle(sim, a.pulses.bundle, 'ability', `ability:${a.id}`, sim.rng.effects);
  sim.log('ability_pulse', { abilityId: a.id, n: entry.payload.n, of: a.pulses.times, rolled }, deltas);
}

/** Remove one open item without applying any of its outcomes. */
function cancelTarget(sim: Simulation, target: string): void {
  const s = sim.state;
  const [kind, id] = [target.slice(0, target.indexOf(':')), target.slice(target.indexOf(':') + 1)];
  const item = condemnTargets(sim).find((c) => c.target === target)!;
  if (kind === 'regionEvent') {
    s.regionEvents = s.regionEvents.filter((e) => e.id !== id);
    removeWhere(s, (e) => e.kind === 'regionEventExpire' && e.payload.eventId === id);
  } else if (kind === 'demand') {
    s.demands = s.demands.filter((d) => d.id !== id);
    removeWhere(s, (e) => e.kind === 'demandExpire' && e.payload.demandId === id);
  } else if (kind === 'response') {
    s.pendingResponses = s.pendingResponses.filter((p) => p.instanceId !== id);
  } else {
    s.ongoing = s.ongoing.filter((o) => o.key !== id);
  }
  sim.log('event_condemned', { kind, id, ref: item.ref, region: item.region ?? null });
}
