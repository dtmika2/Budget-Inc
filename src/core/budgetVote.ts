/** Annual state-budget vote (spec §4.7). */
import { applyPct, budgetTerm, clonePct } from './budget';
import { applyBundle } from './effects';
import { budgetChangePct } from './modifiers';
import { schedule } from './scheduler';
import type { Simulation } from './simulation';
import type { EffectBundle, Range, ResourceId } from './types';

export function scheduleBudgetVotes(sim: Simulation): void {
  const { cfg, state } = sim;
  if (!cfg.budgetVote.enabled) return;
  for (const q of cfg.budgetVote.quarters) {
    if (q > cfg.time.quarters) continue;
    schedule(state, 'budgetVote', sim.absDayOf(q, cfg.budgetVote.day), { quarter: q });
  }
}

/** Just before each vote: every chapter's expenditure grows by mandatoryGrowthPct (through the pipeline). */
export function openBudgetVote(sim: Simulation): void {
  const { state, data, cfg } = sim;
  const pct = cfg.budgetVote.mandatoryGrowthPct;
  if (pct !== 0) {
    const before = state.resources.finances;
    const term0 = budgetTerm(data.budget, state.budget, cfg.finances.scale);
    const eff = budgetChangePct(sim.pipeline(), { type: 'expenditure', changePct: pct }, 'budget_vote');
    applyPct(data.budget, state.budget, '*', 'expenditure', eff);
    sim.recomputeFinances();
    const budgetDelta = budgetTerm(data.budget, state.budget, cfg.finances.scale) - term0;
    sim.log(
      'mandatory_growth',
      { changePct: eff, budgetDelta },
      { resources: { finances: state.resources.finances - before }, anger: {} },
    );
  }
  state.phase = 'budgetVote';
  sim.log('budget_vote_opened', {});
}

export function passChance(sim: Simulation, optionId: string): number {
  const b = sim.cfg.budgetVote;
  const opt = sim.data.budgetVote.find((o) => o.id === optionId);
  const p = b.passBase + (sim.state.resources.coalition - 50) / 100 + (opt?.passChanceMod ?? 0);
  return Math.min(b.passMax, Math.max(b.passMin, p));
}

export function failBundle(sim: Simulation): EffectBundle {
  const effects: Partial<Record<ResourceId, Range>> = {};
  for (const [k, v] of Object.entries(sim.cfg.budgetVote.failEffects)) effects[k as ResourceId] = { min: v, max: v };
  return { effects };
}

export function voteBudget(sim: Simulation, optionId: string): void {
  const opt = sim.data.budgetVote.find((o) => o.id === optionId)!;
  const p_pass = passChance(sim, optionId);
  const roll = sim.rng.budgetVote.next();
  const passed = roll < p_pass;
  const applied = passed
    ? applyBundle(sim, opt, 'budget_vote', `budget_vote:${opt.id}`, sim.rng.effects)
    : applyBundle(sim, failBundle(sim), 'budget_vote', 'budget_vote:failed', sim.rng.effects, true);
  sim.state.phase = 'running';
  sim.log('budget_vote', { optionId, p_pass, roll, passed, rolled: applied.rolled }, applied.deltas);
}

/** Finance delta of a budget option, exact (used by previews and bots). */
export function optionBudgetDelta(sim: Simulation, optionId: string): number {
  const opt = sim.data.budgetVote.find((o) => o.id === optionId);
  if (!opt?.budgetChanges) return 0;
  const pct = clonePct(sim.state.budget);
  const before = budgetTerm(sim.data.budget, pct, sim.cfg.finances.scale);
  for (const bc of opt.budgetChanges) applyPct(sim.data.budget, pct, bc.chapter, bc.type, budgetChangePct(sim.pipeline(), bc, 'budget_vote'));
  return budgetTerm(sim.data.budget, pct, sim.cfg.finances.scale) - before;
}
