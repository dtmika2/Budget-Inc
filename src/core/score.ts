/** Score (spec §4.9) and key decisions (spec §10.3). */
import type { Config } from '../config';
import type { GroupId, LogEntry, ResourceId } from './types';
import { GROUP_IDS, RESOURCE_IDS } from './types';

export function computeScore(
  cfg: Config,
  win: boolean,
  P_final: number,
  quartersCompleted: number,
  resources: Record<ResourceId, number>,
  anger: Record<GroupId, number>,
): number {
  const s = cfg.score;
  let total = (win ? s.win : 0) + s.pFinal * P_final + s.perQuarter * quartersCompleted;
  for (const r of RESOURCE_IDS) total += s.resourceWeight * resources[r];
  for (const g of GROUP_IDS) total += s.angerWeight * (100 - anger[g]);
  return Math.round(total);
}

export const KEY_DECISION_TYPES = ['policy_picked', 'compromise_made', 'chaos_fired', 'event_response', 'budget_vote', 'ability_used'];

/**
 * impact = sum |resource deltas| + angerWeight * sum |anger deltas| (spec §10.3), plus regional shifts
 * weighted by seat share (a +10 shift in a region with 10 % of seats counts like +1 national support).
 */
export function impact(entry: LogEntry, angerWeight: number, seatShare: Record<string, number> = {}): number {
  if (!entry.deltas) return 0;
  let v = 0;
  for (const d of Object.values(entry.deltas.resources)) v += Math.abs(d ?? 0);
  for (const d of Object.values(entry.deltas.anger)) v += angerWeight * Math.abs(d ?? 0);
  for (const [code, d] of Object.entries(entry.deltas.regions ?? {})) v += (seatShare[code] ?? 0) * Math.abs(d ?? 0);
  return v;
}

/** Up to N highest-impact decisions, returned in chronological order. */
export function keyDecisions(log: readonly LogEntry[], cfg: Config, seatShare: Record<string, number> = {}): LogEntry[] {
  const candidates = log
    .map((e, i) => ({ e, i, v: impact(e, cfg.score.angerImpactWeight, seatShare) }))
    .filter((x) => KEY_DECISION_TYPES.includes(x.e.type) && x.v > 0);
  candidates.sort((a, b) => b.v - a.v || a.i - b.i);
  return candidates
    .slice(0, cfg.score.keyDecisions)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.e);
}
