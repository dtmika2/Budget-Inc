/**
 * Annual state-budget vote (spec §4.7, phase 11 sliders, phase 16 hand and zones). At vote open a hand of
 * categories is drawn (config.budgetVote.hand: some core, some extra; categories named by an open budget
 * pledge are always in it) and can be re-rolled for PC. The player sets a slider per shown category
 * (steps of config.budgetVote.sliders.stepPct %), optionally starting from a preset. Slider effects are
 * linear in their steps (scaled by config.budgetVote.impact); a slider outside its category's safe band
 * adds that side's one-off zone bundle (onCut / onOverspend) when the vote passes. Previews equal the
 * applied result. Coalition red lines are drawn from the shown categories.
 */
import { applyPct, budgetTerm, clonePct } from './budget';
import { checkPledgesBudget, pledgesForBudget } from './demands';
import { rerollCost } from './draft';
import { applyBundle } from './effects';
import { budgetChangePct } from './modifiers';
import { schedule } from './scheduler';
import type { Simulation } from './simulation';
import type { BudgetChange, BudgetItem, BudgetZone, EffectBundle, GroupId, Range, RedLine, ResourceId } from './types';
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

/** Categories of the open vote (all of them when no hand is drawn, e.g. in tests outside a vote). */
export function shownItems(sim: Simulation): BudgetItem[] {
  const ids = sim.state.budgetVoteItems;
  return ids ? sim.data.budgetItems.filter((i) => ids.includes(i.id)) : sim.data.budgetItems;
}

/** Take `n` ids from `pool` at random (budgetVote stream). */
function sample(sim: Simulation, pool: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(sim.rng.budgetVote.next() * pool.length), 1)[0]);
  return out;
}

/** Draw the shown categories: hand.core core + hand.extra others; items of open budget pledges always. */
export function drawBudgetHand(sim: Simulation): string[] {
  const { hand } = sim.cfg.budgetVote;
  const items = sim.data.budgetItems;
  const pledged = new Set(pledgesForBudget(sim).map((p) => p.item).filter((id) => items.some((i) => i.id === id)));
  const forced = items.filter((i) => pledged.has(i.id));
  const corePool = items.filter((i) => i.core && !pledged.has(i.id)).map((i) => i.id);
  const extraPool = items.filter((i) => !i.core && !pledged.has(i.id)).map((i) => i.id);
  const core = sample(sim, corePool, Math.max(0, hand.core - forced.filter((i) => i.core).length));
  const extra = sample(sim, extraPool, Math.max(0, hand.extra - forced.filter((i) => !i.core).length));
  const chosen = new Set([...pledged, ...core, ...extra]);
  return items.filter((i) => chosen.has(i.id)).map((i) => i.id);
}

/** Draw the coalition red lines for this vote from the budgetVote stream (deterministic). */
export function drawRedLines(sim: Simulation): RedLine[] {
  const rl = sim.cfg.budgetVote.redLines;
  const pool = shownItems(sim).filter((i) => i.canBeRedLine).map((i) => i.id);
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
  state.budgetVoteRerolls = 0;
  state.budgetVoteItems = drawBudgetHand(sim);
  state.budgetVoteRedLines = drawRedLines(sim);
  state.phase = 'budgetVote';
  sim.log('budget_vote_opened', { items: [...state.budgetVoteItems], redLines: state.budgetVoteRedLines.map((r) => ({ ...r })) });
}

export const budgetRerollCost = (sim: Simulation) =>
  rerollCost(sim.state.budgetVoteRerolls, sim.cfg.budgetVote.reroll.baseCost, sim.cfg.budgetVote.reroll.factor);

export function canRerollBudget(sim: Simulation): string | null {
  if (sim.state.phase !== 'budgetVote') return 'no budget vote open';
  return sim.state.pc >= budgetRerollCost(sim) ? null : 'cannot afford re-roll';
}

/** New hand of categories (pledged ones stay) and new red lines, for PC. */
export function rerollBudget(sim: Simulation): void {
  const { state } = sim;
  const cost = budgetRerollCost(sim);
  state.pc -= cost;
  state.budgetVoteRerolls++;
  state.budgetVoteItems = drawBudgetHand(sim);
  state.budgetVoteRedLines = drawRedLines(sim);
  sim.log('budget_reroll', { cost, items: [...state.budgetVoteItems], redLines: state.budgetVoteRedLines.map((r) => ({ ...r })) });
}

/** Which side of its safe band a slider is on. */
export function zoneOf(item: BudgetItem, steps: number): 'cut' | 'safe' | 'overspend' {
  return steps < item.band.min ? 'cut' : steps > item.band.max ? 'overspend' : 'safe';
}

/** A zone as a plain bundle: regionTraits spread over every kraj with that trait (data order). */
export function zoneBundle(sim: Simulation, zone: BudgetZone): EffectBundle {
  const { regionTraits, pass: _pass, ...bundle } = zone;
  void _pass;
  if (!regionTraits) return bundle;
  const regions: Partial<Record<string, Range>> = { ...(bundle.regions ?? {}) };
  for (const r of sim.data.regions.regions) {
    const traits = sim.data.regionProfiles.regions[r.code]?.traits ?? [];
    for (const tr of traits) if (regionTraits[tr]) regions[r.code] = addRange(regions[r.code], 0, regionTraits[tr]);
  }
  return { ...bundle, regions: regions as Record<string, Range> };
}

/** Sum of two bundles (ranges add, lists concatenate). */
function mergeBundles(a: EffectBundle, b: EffectBundle): EffectBundle {
  const sumRanges = <K extends string>(x?: Partial<Record<K, Range>>, y?: Partial<Record<K, Range>>) => {
    const out: Partial<Record<K, Range>> = { ...(x ?? {}) };
    for (const [k, r] of Object.entries(y ?? {}) as [K, Range][]) out[k] = addRange(out[k], 0, r);
    return out;
  };
  return {
    effects: sumRanges(a.effects, b.effects),
    anger: sumRanges(a.anger, b.anger),
    regions: sumRanges(a.regions, b.regions) as Record<string, Range>,
    ongoing: [...(a.ongoing ?? []), ...(b.ongoing ?? [])],
    budgetChanges: [...(a.budgetChanges ?? []), ...(b.budgetChanges ?? [])],
    pc: (a.pc ?? 0) + (b.pc ?? 0) || undefined,
    tags: a.tags ?? b.tags,
  };
}

/** The zone bundle a slider setting triggers for one category (null inside the band). */
export function itemZone(item: BudgetItem, steps: number): BudgetZone | null {
  const z = zoneOf(item, steps);
  return z === 'cut' ? item.onCut : z === 'overspend' ? item.onOverspend : null;
}

/** Slider positions of a preset, with every category present (0 when not set). */
export function presetSliders(sim: Simulation, presetId: string | null): Sliders {
  const opt = presetId ? sim.data.budgetVote.find((o) => o.id === presetId) : undefined;
  const out: Sliders = {};
  for (const it of shownItems(sim)) out[it.id] = opt?.sliders[it.id] ?? 0;
  return out;
}

export function sameSliders(sim: Simulation, a: Sliders, b: Sliders): boolean {
  return shownItems(sim).every((it) => (a[it.id] ?? 0) === (b[it.id] ?? 0));
}

/** Null if valid, else a reason. A preset id is only valid with that preset's exact slider positions. */
export function validateVote(sim: Simulation, sliders: Sliders, presetId: string | null): string | null {
  const { minSteps, maxSteps } = sim.cfg.budgetVote.sliders;
  const shown = shownItems(sim);
  for (const [id, v] of Object.entries(sliders)) {
    if (!sim.data.budgetItems.some((it) => it.id === id)) return `unknown budget item ${id}`;
    if (!shown.some((it) => it.id === id) && v !== 0) return `budget item ${id} is not in this vote`;
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
  for (const it of shownItems(sim)) {
    const s = sliders[it.id] ?? 0;
    p += it.passPerStep * b.impact * s + (itemZone(it, s)?.pass ?? 0);
  }
  p -= b.redLines.passPenalty * violations(sim, sliders).length;
  return Math.min(b.passMax, Math.max(b.passMin, p));
}

const addRange = (a: Range | undefined, v: number, r?: Range): Range => ({ min: (a?.min ?? 0) + v + (r?.min ?? 0), max: (a?.max ?? 0) + v + (r?.max ?? 0) });

/** Budget changes of the sliders alone (hidden chapters). */
export function sliderBudgetChanges(sim: Simulation, sliders: Sliders): BudgetChange[] {
  const step = sim.cfg.budgetVote.sliders.stepPct;
  const out: BudgetChange[] = [];
  for (const it of shownItems(sim)) {
    const s = sliders[it.id] ?? 0;
    if (s === 0) continue;
    for (const c of it.chapters) out.push({ chapter: c.chapter, type: c.type, changePct: s * step * c.weight });
  }
  return out;
}

/** The whole vote as one effect bundle: preset base effects + linear slider effects + zone bundles. */
export function voteBundle(sim: Simulation, sliders: Sliders, presetId: string | null): EffectBundle {
  let bundle = sliderBundle(sim, sliders, presetId);
  for (const it of shownItems(sim)) {
    const zone = itemZone(it, sliders[it.id] ?? 0);
    if (zone) bundle = mergeBundles(bundle, zoneBundle(sim, zone));
  }
  return bundle;
}

/** Preset base effects + linear slider effects (x config.budgetVote.impact). */
function sliderBundle(sim: Simulation, sliders: Sliders, presetId: string | null): EffectBundle {
  const impact = sim.cfg.budgetVote.impact;
  const opt = presetId ? sim.data.budgetVote.find((o) => o.id === presetId) : undefined;
  const effects: Partial<Record<ResourceId | 'financesExtra', Range>> = { ...(opt?.effects ?? {}) };
  const anger: Partial<Record<GroupId, Range>> = { ...(opt?.anger ?? {}) };
  let support = 0;
  const angerSum: Partial<Record<GroupId, number>> = {};
  for (const it of shownItems(sim)) {
    const s = sliders[it.id] ?? 0;
    if (s === 0) continue;
    support += it.supportPerStep * impact * s;
    for (const g of GROUP_IDS) {
      const a = it.angerPerStep[g];
      if (a) angerSum[g] = (angerSum[g] ?? 0) + a * impact * s;
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
  for (const it of shownItems(sim)) full[it.id] = sliders[it.id] ?? 0;
  const zones = Object.fromEntries(shownItems(sim).map((it) => [it.id, zoneOf(it, full[it.id])]).filter(([, z]) => z !== 'safe'));
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
  sim.state.budgetVoteItems = null;
  sim.state.phase = 'running';
  sim.log(
    'budget_vote',
    { presetId, sliders: full, zones, redLines, violations: crossed, p_pass, roll, passed, rolled: applied.rolled },
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
