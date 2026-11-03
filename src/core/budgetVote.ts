/**
 * Annual state-budget vote (spec §4.7, phase 11 sliders). The player sets a slider per budget category
 * (steps of config.budgetVote.sliders.stepPct %), optionally starting from a preset. Every slider effect
 * is linear in its steps, so previews equal the applied result. Coalition red lines are drawn at vote open.
 */
import { applyPct, budgetTerm, clonePct } from './budget';
import { checkPledgesBudget } from './demands';
import { applyBundle } from './effects';
import { budgetChangePct } from './modifiers';
import { schedule } from './scheduler';
import type { Simulation } from './simulation';
import type { BudgetChange, EffectBundle, GroupId, Range, RedLine, ResourceId } from './types';
import { GROUP_IDS } from './types';

export type Sliders = Record<string, number>;

export function scheduleBudgetVotes(sim: Simulation): void {
  const { cfg, state } = sim;
  if (!cfg.budgetVote.enabled) return;
  for (const q of cfg.budgetVote.quarters) {
    if (q > cfg.time.quarters) continue;
    schedule(state, 'budgetVote', sim.absDayOf(q, cfg.budgetVote.day), { quarter: q });
  }
}

/** Draw the coalition red lines for this vote from the budgetVote stream (deterministic). */
export function drawRedLines(sim: Simulation): RedLine[] {
  const rl = sim.cfg.budgetVote.redLines;
  const pool = sim.data.budgetItems.filter((i) => i.canBeRedLine).map((i) => i.id);
  const n = Math.min(pool.length, sim.rng.budgetVote.int(rl.min, rl.max));
  const out: RedLine[] = [];
  for (let i = 0; i < n; i++) {
    const item = pool.splice(Math.floor(sim.rng.budgetVote.next() * pool.length), 1)[0];
    out.push({ item, maxCutSteps: rl.maxCutSteps });
  }
  return out;
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
  state.budgetVoteRedLines = drawRedLines(sim);
  state.phase = 'budgetVote';
  sim.log('budget_vote_opened', { redLines: state.budgetVoteRedLines.map((r) => ({ ...r })) });
}

/** Slider positions of a preset, with every category present (0 when not set). */
export function presetSliders(sim: Simulation, presetId: string | null): Sliders {
  const opt = presetId ? sim.data.budgetVote.find((o) => o.id === presetId) : undefined;
  const out: Sliders = {};
  for (const it of sim.data.budgetItems) out[it.id] = opt?.sliders[it.id] ?? 0;
  return out;
}

export function sameSliders(sim: Simulation, a: Sliders, b: Sliders): boolean {
  return sim.data.budgetItems.every((it) => (a[it.id] ?? 0) === (b[it.id] ?? 0));
}

/** Null if valid, else a reason. A preset id is only valid with that preset's exact slider positions. */
export function validateVote(sim: Simulation, sliders: Sliders, presetId: string | null): string | null {
  const { minSteps, maxSteps } = sim.cfg.budgetVote.sliders;
  for (const [id, v] of Object.entries(sliders)) {
    if (!sim.data.budgetItems.some((it) => it.id === id)) return `unknown budget item ${id}`;
    if (!Number.isInteger(v) || v < minSteps || v > maxSteps) return `bad slider value for ${id}`;
  }
  if (presetId !== null) {
    if (!sim.data.budgetVote.some((o) => o.id === presetId)) return 'no such preset';
    if (!sameSliders(sim, sliders, presetSliders(sim, presetId))) return 'sliders differ from the preset';
  }
  return null;
}

/** Red lines crossed by these sliders. */
export function violations(sim: Simulation, sliders: Sliders): RedLine[] {
  return (sim.state.budgetVoteRedLines ?? []).filter((r) => (sliders[r.item] ?? 0) < -r.maxCutSteps);
}

export function passChance(sim: Simulation, sliders: Sliders, presetId: string | null): number {
  const b = sim.cfg.budgetVote;
  const opt = presetId ? sim.data.budgetVote.find((o) => o.id === presetId) : undefined;
  let p = b.passBase + (sim.state.resources.coalition - 50) / 100 + (opt?.passChanceMod ?? 0);
  for (const it of sim.data.budgetItems) p += it.passPerStep * (sliders[it.id] ?? 0);
  p -= b.redLines.passPenalty * violations(sim, sliders).length;
  return Math.min(b.passMax, Math.max(b.passMin, p));
}

const addRange = (a: Range | undefined, v: number): Range => ({ min: (a?.min ?? 0) + v, max: (a?.max ?? 0) + v });

/** Budget changes of the sliders alone (hidden chapters). */
export function sliderBudgetChanges(sim: Simulation, sliders: Sliders): BudgetChange[] {
  const step = sim.cfg.budgetVote.sliders.stepPct;
  const out: BudgetChange[] = [];
  for (const it of sim.data.budgetItems) {
    const s = sliders[it.id] ?? 0;
    if (s === 0) continue;
    for (const c of it.chapters) out.push({ chapter: c.chapter, type: c.type, changePct: s * step * c.weight });
  }
  return out;
}

/** The whole vote as one effect bundle: preset base effects + linear slider effects. */
export function voteBundle(sim: Simulation, sliders: Sliders, presetId: string | null): EffectBundle {
  const opt = presetId ? sim.data.budgetVote.find((o) => o.id === presetId) : undefined;
  const effects: Partial<Record<ResourceId | 'financesExtra', Range>> = { ...(opt?.effects ?? {}) };
  const anger: Partial<Record<GroupId, Range>> = { ...(opt?.anger ?? {}) };
  let support = 0;
  const angerSum: Partial<Record<GroupId, number>> = {};
  for (const it of sim.data.budgetItems) {
    const s = sliders[it.id] ?? 0;
    if (s === 0) continue;
    support += it.supportPerStep * s;
    for (const g of GROUP_IDS) {
      const a = it.angerPerStep[g];
      if (a) angerSum[g] = (angerSum[g] ?? 0) + a * s;
    }
  }
  if (support !== 0) effects.support = addRange(effects.support, support);
  for (const g of GROUP_IDS) if (angerSum[g]) anger[g] = addRange(anger[g], angerSum[g]!);
  return {
    effects,
    anger,
    ongoing: opt?.ongoing,
    pc: opt?.pc,
    regions: opt?.regions,
    budgetChanges: [...(opt?.budgetChanges ?? []), ...sliderBudgetChanges(sim, sliders)],
  };
}

export function failBundle(sim: Simulation): EffectBundle {
  const effects: Partial<Record<ResourceId, Range>> = {};
  for (const [k, v] of Object.entries(sim.cfg.budgetVote.failEffects)) effects[k as ResourceId] = { min: v, max: v };
  return { effects };
}

export function voteBudget(sim: Simulation, sliders: Sliders, presetId: string | null): void {
  const full: Sliders = {};
  for (const it of sim.data.budgetItems) full[it.id] = sliders[it.id] ?? 0;
  const p_pass = passChance(sim, full, presetId);
  const redLines = (sim.state.budgetVoteRedLines ?? []).map((r) => ({ ...r }));
  const crossed = violations(sim, full).map((r) => r.item);
  const roll = sim.rng.budgetVote.next();
  const passed = roll < p_pass;
  const origin = `budget_vote:${presetId ?? 'custom'}`;
  const applied = passed
    ? applyBundle(sim, voteBundle(sim, full, presetId), 'budget_vote', origin, sim.rng.effects)
    : applyBundle(sim, failBundle(sim), 'budget_vote', 'budget_vote:failed', sim.rng.effects, true);
  sim.state.budgetVoteRedLines = null;
  sim.state.phase = 'running';
  sim.log(
    'budget_vote',
    { presetId, sliders: full, redLines, violations: crossed, p_pass, roll, passed, rolled: applied.rolled },
    applied.deltas,
  );
  checkPledgesBudget(sim, full, passed);
}

/** Finance delta of a slider setting, exact (used by previews, tests and bots). */
export function sliderBudgetDelta(sim: Simulation, sliders: Sliders, presetId: string | null = null): number {
  const bundle = voteBundle(sim, sliders, presetId);
  const pct = clonePct(sim.state.budget);
  const before = budgetTerm(sim.data.budget, pct, sim.cfg.finances.scale);
  for (const bc of bundle.budgetChanges ?? [])
    applyPct(sim.data.budget, pct, bc.chapter, bc.type, budgetChangePct(sim.pipeline(), bc, 'budget_vote'));
  return budgetTerm(sim.data.budget, pct, sim.cfg.finances.scale) - before;
}
