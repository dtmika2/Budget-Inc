/**
 * Generic timed entries (spec §7.1): everything that happens "on day X" — budget votes, chaos events,
 * pin spawns and expiries — goes through here, so future data-driven events only need a new kind.
 */
import type { GameState, ScheduledEntry, ScheduledKind } from './types';

/** Order of firing within one day (plan §3.4 step 1). */
export const KIND_PRIORITY: Record<ScheduledKind, number> = {
  budgetVote: 0,
  compromise: 1,
  special: 2,
  chaos: 3,
  pinSpawn: 4,
  pinExpire: 5,
  demandSpawn: 6,
  demandExpire: 7,
  regionEventSpawn: 8,
  regionEventExpire: 9,
};

export function schedule(state: GameState, kind: ScheduledKind, absDay: number, payload: ScheduledEntry['payload']): ScheduledEntry {
  const entry: ScheduledEntry = { seq: state.scheduleSeq++, kind, absDay, payload };
  state.schedule.push(entry);
  return entry;
}

/** Remove and return the next entry due on `absDay` (by kind priority, then insertion order). */
export function takeNextDue(state: GameState, absDay: number): ScheduledEntry | null {
  let best = -1;
  for (let i = 0; i < state.schedule.length; i++) {
    const e = state.schedule[i];
    if (e.absDay !== absDay) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const b = state.schedule[best];
    if (KIND_PRIORITY[e.kind] < KIND_PRIORITY[b.kind] || (KIND_PRIORITY[e.kind] === KIND_PRIORITY[b.kind] && e.seq < b.seq)) best = i;
  }
  if (best < 0) return null;
  return state.schedule.splice(best, 1)[0];
}

export function removeWhere(state: GameState, pred: (e: ScheduledEntry) => boolean): ScheduledEntry[] {
  const removed = state.schedule.filter(pred);
  state.schedule = state.schedule.filter((e) => !pred(e));
  return removed;
}
