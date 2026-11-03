/**
 * Event timeline (catastrophes workspace, see CATASTROPHES.md): what the player sees on the strip in the top
 * right, from `quartersBack` quarters ago to `quartersAhead` quarters ahead.
 *
 * - Always known: quarter starts, budget votes, the election.
 * - '?' until `revealDays` before they happen: chaos events from picked cards (a '?' says something will
 *   happen, not what).
 * - Never shown ahead: catastrophes and special agents (they are surprises), opportunity pins, regional
 *   demands, compromises.
 * Past items come from the log with their outcome (chaos events, catastrophes and agents that happened).
 * Pure: derived from state, no side effects.
 */
import { specialCard } from './specialCards';
import type { Simulation } from './simulation';

export type TimelineKind = 'quarter' | 'budgetVote' | 'election' | 'catastrophe' | 'agent' | 'chaos';

export interface TimelineItem {
  /** Stable id: the same item keeps it while it moves along the strip (reveal detection in the UI). */
  id: string;
  kind: TimelineKind;
  absDay: number;
  past: boolean;
  /** False: shown as '?' (what it is stays hidden). */
  revealed: boolean;
  /** Special card id, chaos event id, or the quarter number for 'quarter' / 'budgetVote'. */
  ref?: string;
  /** Past items: how it went. */
  outcome?: 'passed' | 'failed' | 'happened';
}

export interface TimelineWindow {
  from: number;
  to: number;
  now: number;
}

export function timelineWindow(sim: Simulation): TimelineWindow {
  const { cfg } = sim;
  const q = cfg.time.daysPerQuarter;
  const now = sim.absDay;
  return { from: now - cfg.timeline.quartersBack * q, to: now + cfg.timeline.quartersAhead * q, now };
}

/** Is a future item `absDay` close enough to be shown for what it is? */
export function isRevealed(sim: Simulation, absDay: number): boolean {
  return absDay - sim.absDay <= sim.cfg.timeline.revealDays;
}

export function timelineItems(sim: Simulation): TimelineItem[] {
  const { cfg, state } = sim;
  const w = timelineWindow(sim);
  const lastDay = sim.absDayOf(cfg.time.quarters, cfg.time.daysPerQuarter);
  const inWindow = (d: number) => d >= w.from && d <= w.to;
  const out: TimelineItem[] = [];

  // known from the start
  for (let q = 1; q <= cfg.time.quarters; q++) {
    const d = sim.absDayOf(q, 1);
    if (inWindow(d)) out.push({ id: `q${q}`, kind: 'quarter', absDay: d, past: d < w.now, revealed: true, ref: String(q) });
  }
  if (cfg.budgetVote.enabled)
    for (const q of cfg.budgetVote.quarters) {
      if (q > cfg.time.quarters) continue;
      const d = sim.absDayOf(q, cfg.budgetVote.day);
      if (!inWindow(d)) continue;
      const done = state.log.find((e) => e.type === 'budget_vote' && e.absDay === d);
      out.push({
        id: `bv${q}`,
        kind: 'budgetVote',
        absDay: d,
        past: !!done || d < w.now,
        revealed: true,
        ref: String(q),
        outcome: done ? (done.passed ? 'passed' : 'failed') : undefined,
      });
    }
  if (inWindow(lastDay)) out.push({ id: 'election', kind: 'election', absDay: lastDay, past: false, revealed: true });

  // past special cards and chaos events (from the log)
  for (const e of state.log) {
    if (!inWindow(e.absDay)) continue;
    if (e.type === 'special_resolved') {
      const card = specialCard(sim, String(e.cardId));
      if (card) out.push({ id: `sp:${String(e.id)}`, kind: card.kind, absDay: e.absDay, past: true, revealed: true, ref: card.id, outcome: e.passed ? 'passed' : 'failed' });
    } else if (e.type === 'chaos_fired') {
      out.push({ id: `ch:${String(e.instanceId)}`, kind: 'chaos', absDay: e.absDay, past: true, revealed: true, ref: String(e.eventId), outcome: 'happened' });
    }
  }

  // coming chaos events: '?' until revealDays before (catastrophes and agents are never shown ahead)
  for (const e of state.schedule) {
    if (e.kind !== 'chaos' || !inWindow(e.absDay)) continue;
    out.push({ id: `chs:${e.seq}`, kind: 'chaos', absDay: e.absDay, past: false, revealed: isRevealed(sim, e.absDay), ref: String(e.payload.eventId) });
  }
  return out.sort((a, b) => a.absDay - b.absDay || a.id.localeCompare(b.id));
}
