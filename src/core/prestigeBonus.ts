/**
 * Prestige bonuses (P24, stakeholder feedback): high Prestige pays off. Every config.prestigeBonus.everyDays
 * days, with Prestige at or above `from`, there is a chance (growing with Prestige) of a bonus: Support,
 * Coalition (the partner likes you), or the angriest group calming down. Uses its own RNG stream `prestige`,
 * so it never shifts any other random draw.
 */
import type { Config } from '../config';
import { applyBundle } from './effects';
import type { Simulation } from './simulation';
import type { EffectBundle, GroupId } from './types';
import { GROUP_IDS } from './types';

export type PrestigeBonusKind = 'support' | 'coalition' | 'group';

/** Chance of a bonus at this Prestige (0 below `from`). */
export function prestigeBonusChance(cfg: Config, prestige: number): number {
  const b = cfg.prestigeBonus;
  if (prestige < b.from) return 0;
  return Math.min(b.chanceMax, b.chanceAtFrom + (prestige - b.from) * b.chancePerPoint);
}

/** The angriest group (ties: data order); the target of a 'group' bonus. */
function angriest(anger: Record<GroupId, number>): GroupId {
  return GROUP_IDS.reduce((best, g) => (anger[g] > anger[best] ? g : best), GROUP_IDS[0]);
}

/** Called once per day: rolls a bonus on every `everyDays`-th day of the run. */
export function rollPrestigeBonus(sim: Simulation): void {
  const { cfg, state } = sim;
  const b = cfg.prestigeBonus;
  const day = sim.absDay;
  if (day <= 0 || day % b.everyDays !== 0) return;
  const rng = sim.rng.prestige;
  // always draw the same numbers, so the stream does not depend on Prestige
  const roll = rng.next();
  const pick = rng.next();
  if (roll >= prestigeBonusChance(cfg, state.resources.prestige)) return;
  const kinds = Object.entries(b.kinds) as [PrestigeBonusKind, { weight: number; value: number }][];
  const total = kinds.reduce((s, [, k]) => s + k.weight, 0);
  let acc = 0;
  let kind: PrestigeBonusKind = kinds[0][0];
  for (const [id, k] of kinds) {
    acc += k.weight / total;
    if (pick < acc) {
      kind = id;
      break;
    }
  }
  const v = b.kinds[kind].value;
  const group = kind === 'group' ? angriest(state.anger) : null;
  const bundle: EffectBundle =
    kind === 'group' ? { anger: { [group!]: { min: v, max: v } } } : { effects: { [kind]: { min: v, max: v } } };
  const { deltas } = applyBundle(sim, bundle, 'prestige', 'prestige_bonus', rng);
  sim.log('prestige_bonus', { kind, group }, deltas);
}
