/**
 * Kraj action passives (regions workspace, see RegionPassive in ./types): which passives are active, read by
 * the demand and region-event spawners (keep out of a protected kraj) and by applyBundle (shielded losses).
 * Pure, imports only types, so the effect and demand code can use it without an import cycle.
 */
import type { Config } from '../config';
import type { GameData, GameState, RegionPassive } from './types';

interface Host {
  readonly state: GameState;
  readonly data: GameData;
  readonly cfg: Config;
}

export interface ActivePassive {
  region: string;
  actionId: string;
  passive: RegionPassive;
  /** The action's quarter, and the last quarter the passive is active in. */
  fromQuarter: number;
  untilQuarter: number;
}

/** Passives active now (all kraje, or one), in the order the actions were done. */
export function activePassives(host: Host, region?: string): ActivePassive[] {
  const n = host.cfg.regionActions.passiveQuarters;
  const q = host.state.quarter;
  const out: ActivePassive[] = [];
  for (const d of host.state.regionActionsDone) {
    if (region !== undefined && d.region !== region) continue;
    const until = d.quarter + n - 1;
    if (q < d.quarter || q > until) continue;
    const passive = host.data.regionActions.find((a) => a.id === d.actionId)?.passive;
    if (passive) out.push({ region: d.region, actionId: d.actionId, passive, fromQuarter: d.quarter, untilQuarter: until });
  }
  return out;
}

export const hasPassive = (host: Host, region: string, type: RegionPassive['type']): boolean =>
  activePassives(host, region).some((p) => p.passive.type === type);

/** Multiplier on the kraj's support losses (1 = unshielded; the strongest shield wins). */
export function regionLossMult(host: Host, region: string): number {
  let m = 1;
  for (const p of activePassives(host, region)) if (p.passive.type === 'shieldLosses') m = Math.min(m, p.passive.value);
  return m;
}
