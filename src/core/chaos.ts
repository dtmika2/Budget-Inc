/** Chaos events (spec §7.1) and respondable events (spec §7.3). */
import { applyBundle } from './effects';
import { schedule } from './scheduler';
import type { Simulation } from './simulation';
import type { PolicyCard, ScheduledEntry } from './types';

type PickedCard = Pick<PolicyCard, 'id' | 'chaosEvents'>;

/** On pick: each referenced event rolls `chance * chaosMultiplier` once; if it passes it is scheduled. */
export function scheduleChaosForPick(sim: Simulation, card: PickedCard): void {
  const { state, cfg } = sim;
  const rng = sim.rng.chaos;
  for (const eventId of card.chaosEvents) {
    const ev = sim.eventById.get(eventId);
    if (!ev) continue;
    const chance = Math.min(1, ev.chance * sim.preset.chaosMultiplier);
    const roll = rng.next();
    if (roll >= chance) {
      sim.log('chaos_scheduled', { eventId, cardId: card.id, notFired: true, roll, chance });
      continue;
    }
    const offset = Math.min(ev.quarterOffset, cfg.chaos.maxQuarterOffset);
    const quarter = state.quarter + offset;
    const day = rng.int(ev.window.fromDay, ev.window.toDay);
    const absDay = sim.absDayOf(quarter, day);
    schedule(state, 'chaos', absDay, { eventId, cardId: card.id });
    sim.log('chaos_scheduled', { eventId, cardId: card.id, scheduledQuarter: quarter, scheduledDay: day, roll, chance });
  }
}

export function fireChaos(sim: Simulation, entry: ScheduledEntry): void {
  const { state } = sim;
  const eventId = String(entry.payload.eventId);
  const ev = sim.eventById.get(eventId);
  if (!ev) return;
  const instanceId = `evt${state.eventSeq++}`;
  const { rolled, deltas } = applyBundle(sim, ev, 'chaos', `chaos:${eventId}`, sim.rng.effects);
  const respondable = !!ev.responses;
  if (ev.responses) state.pendingResponses.push({ instanceId, eventId, firedAbsDay: sim.absDay });
  sim.log('chaos_fired', { eventId, instanceId, cardId: entry.payload.cardId, respondable, rolled }, deltas);
}

export function canRespond(sim: Simulation, instanceId: string, responseId: string, timedOut: boolean): string | null {
  const pending = sim.state.pendingResponses.find((p) => p.instanceId === instanceId);
  if (!pending) return 'no such pending event';
  const ev = sim.eventById.get(pending.eventId);
  if (!ev?.responses) return 'event has no responses';
  const optId = timedOut ? ev.responses.default : responseId;
  const opt = ev.responses.options.find((o) => o.id === optId);
  if (!opt) return 'no such response';
  if (!timedOut && opt.cost.pc > sim.state.pc) return 'cannot afford response';
  return null;
}

/** On timeout the event's `default` response applies regardless of `responseId`. */
export function respond(sim: Simulation, instanceId: string, responseId: string, timedOut: boolean): void {
  const { state } = sim;
  const idx = state.pendingResponses.findIndex((p) => p.instanceId === instanceId);
  const pending = state.pendingResponses[idx];
  const ev = sim.eventById.get(pending.eventId)!;
  const optId = timedOut ? ev.responses!.default : responseId;
  const opt = ev.responses!.options.find((o) => o.id === optId)!;
  const cost = Math.min(opt.cost.pc, state.pc);
  state.pc -= cost;
  state.pendingResponses.splice(idx, 1);
  const { rolled, deltas } = applyBundle(sim, opt, 'response', `response:${ev.id}:${opt.id}`, sim.rng.effects);
  sim.log('event_response', { eventId: ev.id, instanceId, responseId: opt.id, cost, timedOut, rolled }, deltas);
}
