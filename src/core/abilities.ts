/** Leader abilities (spec §5.2): data entries made of modifiers and an instant effect bundle. */
import { applyBundle } from './effects';
import { instantiate } from './modifiers';
import type { Simulation } from './simulation';

/** 1 charge per game year; recharges at the start of quarters 5, 9 and 13; unused charges do not stack. */
export function rechargeIfYearStart(sim: Simulation): void {
  const { cfg, state } = sim;
  if (!cfg.abilities.rechargeQuarters.includes(state.quarter)) return;
  state.abilityCharges = cfg.abilities.chargesPerYear;
  sim.log('ability_recharged', { abilityId: sim.leaderDef.ability.id });
}

export function canUseAbility(sim: Simulation): string | null {
  if (sim.state.abilityCharges <= 0) return 'no charge';
  if (sim.state.phase !== 'running' && sim.state.phase !== 'draft') return 'not now';
  return null;
}

export function activateAbility(sim: Simulation): void {
  const ability = sim.leaderDef.ability;
  sim.state.abilityCharges -= 1;
  sim.state.modifiers.push(...instantiate(ability.modifiers, `ability:${ability.id}`));
  const { rolled, deltas } = applyBundle(sim, ability.bundle, 'ability', `ability:${ability.id}`, sim.rng.effects);
  sim.log('ability_used', { abilityId: ability.id, rolled }, deltas);
}
