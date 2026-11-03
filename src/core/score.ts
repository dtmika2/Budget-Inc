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

export const KEY_DECISION_TYPES = ['policy_picked', 'chaos_fired', 'event_response', 'budget_vote', 'ability_used'];

export function impact(entry: LogEntry, angerWeight: number): number {
  if (!entry.deltas) return 0;
  let v = 0;
  for (const d of Object.values(entry.deltas.resources)) v += Math.abs(d ?? 0);
  for (const d of Object.values(entry.deltas.anger)) v += angerWeight * Math.abs(d ?? 0);
  return v;
}

/** Up to N highest-impact decisions, returned in chronological order. */
export function keyDecisions(log: readonly LogEntry[], cfg: Config): LogEntry[] {
  const candidates = log
    .map((e, i) => ({ e, i, v: impact(e, cfg.score.angerImpactWeight) }))
    .filter((x) => KEY_DECISION_TYPES.includes(x.e.type) && x.v > 0);
  candidates.sort((a, b) => b.v - a.v || a.i - b.i);
  return candidates
    .slice(0, cfg.score.keyDecisions)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.e);
}
