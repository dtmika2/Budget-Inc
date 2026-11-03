/**
 * The single value-change pipeline (spec §4.8):
 *   roll -> (if bad) global negative multiplier -> (value + sum of adds) * product of multipliers -> clamp.
 * Rolling and clamping happen in effects.ts / simulation.ts; this module does steps 2–4.
 */
import type { BudgetChange, ChangeSource, GroupId, Modifier, ModifierDef, ResourceId } from './types';

export interface PipelineCtx {
  modifiers: readonly Modifier[];
  /** Difficulty knob applied to bad changes (§4.9). */
  negativeMultiplier: number;
}

export function modifierMatches(m: ModifierDef, targets: readonly string[], source: ChangeSource | 'any'): boolean {
  if (!targets.includes(m.target)) return false;
  const ms = m.source ?? 'any';
  return ms === 'any' || ms === source;
}

/** (value + sum of additive) * product of multipliers. */
export function combine(value: number, mods: readonly ModifierDef[]): number {
  let add = 0;
  let mul = 1;
  for (const m of mods) {
    if (m.type === 'add') add += m.value;
    else mul *= m.value;
  }
  return (value + add) * mul;
}

function matching(ctx: PipelineCtx, targets: string[], source: ChangeSource | 'any'): Modifier[] {
  return ctx.modifiers.filter((m) => modifierMatches(m, targets, source));
}

/**
 * A change to a resource. Drift skips the global negative multiplier (difficulty has its own drift
 * multiplier) and additionally matches `<resource>.drift`. A negative Finances change also matches
 * `finances.negative`.
 */
export function resourceChange(ctx: PipelineCtx, res: ResourceId, raw: number, source: ChangeSource): number {
  if (raw === 0) return 0;
  let v = raw;
  const targets: string[] = [];
  if (source === 'drift') targets.push(`${res}.drift`);
  else if (v < 0) v *= ctx.negativeMultiplier;
  targets.push(v < 0 ? `${res}.loss` : `${res}.gain`);
  if (res === 'finances' && v < 0) targets.push('finances.negative');
  return combine(v, matching(ctx, targets, source));
}

/** A change to an anger meter (+ = angrier = bad). */
export function angerChange(ctx: PipelineCtx, group: GroupId, raw: number, source: ChangeSource): number {
  if (raw === 0) return 0;
  let v = raw;
  if (v > 0) v *= ctx.negativeMultiplier;
  return combine(v, matching(ctx, [`anger.${group}.${v > 0 ? 'gain' : 'loss'}`], source));
}

/** True when a budget change lowers the balance (revenue down or expenditure up). */
export function worsensBalance(bc: Pick<BudgetChange, 'type' | 'changePct'>): boolean {
  return bc.type === 'revenue' ? bc.changePct < 0 : bc.changePct > 0;
}

/**
 * Effective changePct of a budget change. A worsening change is bad for Finances: it gets the global
 * negative multiplier and every `finances.negative` / `finances.loss` multiplier (e.g. Austerity Freeze).
 * Additive modifiers are not meaningful for percentages and are ignored here.
 */
export function budgetChangePct(ctx: PipelineCtx, bc: Pick<BudgetChange, 'type' | 'changePct'>, source: ChangeSource): number {
  if (!worsensBalance(bc)) return bc.changePct;
  let mul = ctx.negativeMultiplier;
  for (const m of matching(ctx, ['finances.negative', 'finances.loss'], source)) if (m.type === 'multiplier') mul *= m.value;
  return bc.changePct * mul;
}

/** A plain number adjusted by modifiers on `target` (e.g. `election.T_base`, `pc.perQuarter`). */
export function scalar(ctx: PipelineCtx, target: string, base: number): number {
  return combine(base, matching(ctx, [target], 'any'));
}

/** Decrement timed modifiers by one day and drop expired ones. */
export function tickModifiers(mods: Modifier[]): Modifier[] {
  for (const m of mods) if (m.daysLeft !== undefined) m.daysLeft -= 1;
  return mods.filter((m) => m.daysLeft === undefined || m.daysLeft > 0);
}

export function instantiate(defs: readonly ModifierDef[], origin: string): Modifier[] {
  return defs.map((d) => ({ ...d, origin, daysLeft: d.days }));
}
