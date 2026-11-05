/**
 * Budget vote commentary (phase 23): what a slider step does and why, which moves would be better, and
 * where a resource / group / kraj number comes from. Pure: everything is derived from previews (no RNG,
 * no state changes). Reasons are structured; the UI turns them into text. Recommendations are scored with
 * the greedy bot's vote value, so the advice and the bot agree on what "better" means.
 */
import { budgetFailValue, voteValue } from './bots';
import { presetSliders, requestMet, sameSliders, shownItems, validateVote, violations, zoneOf, type Sliders } from './budgetVote';
import { budgetConditionMet, pledgesForBudget } from './demands';
import type { PreviewRanges } from './effects';
import type { Simulation } from './simulation';
import type { GroupId, Range, ResourceId } from './types';
import { GROUP_IDS, RESOURCE_IDS } from './types';

export type VotePreview = PreviewRanges & { passChance: number; violations: string[] };

/** A metric of the impact lanes: a resource, a group's anger or a kraj's support. */
export type MetricKey = { kind: 'resource'; id: ResourceId } | { kind: 'group'; id: GroupId } | { kind: 'kraj'; id: string };

export type AdviceReason =
  | { kind: 'zoneEnter'; item: string; zone: 'cut' | 'overspend' }
  | { kind: 'zoneLeave'; item: string; zone: 'cut' | 'overspend' }
  | { kind: 'pass'; delta: number }
  | { kind: 'redLine'; item: string; maxCutSteps: number }
  | { kind: 'redLineFixed'; item: string }
  | { kind: 'pledgeMet'; item: string; region: string }
  | { kind: 'pledgeBroken'; item: string; region: string }
  | { kind: 'requestMet'; item: string; party: string; dir: 1 | -1 }
  | { kind: 'requestMissed'; item: string; party: string; dir: 1 | -1 }
  | { kind: 'metric'; metric: MetricKey; delta: number };

/** A recommended setting: undo the inspected step, move one slider by one step, or take a preset. */
export interface Suggestion {
  kind: 'keep' | 'step' | 'preset';
  item?: string;
  dir?: 1 | -1;
  presetId: string | null;
  sliders: Sliders;
  /** Expected-value gain over the inspected setting. */
  gain: number;
  /** Changes against the inspected setting. */
  pass: number;
  finances: number;
  support: number;
  /** Why it is better (largest changes), against the inspected setting. */
  reasons: AdviceReason[];
}

export interface StepAdvice {
  item: string;
  from: number;
  to: number;
  sliders: Sliders;
  presetId: string | null;
  before: VotePreview;
  after: VotePreview;
  reasons: AdviceReason[];
}

const mid = (r?: Range) => (r ? (r.min + r.max) / 2 : 0);

/** The preset id that stays valid for these sliders (a preset only holds with its exact positions). */
export function keptPreset(sim: Simulation, sliders: Sliders, presetId: string | null): string | null {
  return presetId && sameSliders(sim, sliders, presetSliders(sim, presetId)) ? presetId : null;
}

/** Mid value of one metric in a preview. */
export function metricValue(p: PreviewRanges, m: MetricKey): number {
  return m.kind === 'resource' ? mid(p.resources[m.id]) : m.kind === 'group' ? mid(p.anger[m.id]) : mid(p.regions[m.id]);
}

/** Is a positive change of this metric good for the player? (Anger: no.) */
export const metricUpIsGood = (m: MetricKey) => m.kind !== 'group';

/** The largest metric changes from `a` to `b`: top resources / groups, then top kraje. */
function metricDiffs(sim: Simulation, a: PreviewRanges, b: PreviewRanges): AdviceReason[] {
  const cfg = sim.cfg.budgetAdvice;
  const keys: MetricKey[] = [
    ...RESOURCE_IDS.map((id) => ({ kind: 'resource', id }) as MetricKey),
    ...GROUP_IDS.map((id) => ({ kind: 'group', id }) as MetricKey),
  ];
  const diff = (m: MetricKey) => metricValue(b, m) - metricValue(a, m);
  const big = (list: MetricKey[], n: number) =>
    list
      .map((m) => ({ m, d: diff(m) }))
      .filter((x) => Math.abs(x.d) >= cfg.minDelta)
      .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
      .slice(0, n)
      .map((x): AdviceReason => ({ kind: 'metric', metric: x.m, delta: x.d }));
  const kraje = [...new Set([...Object.keys(a.regions), ...Object.keys(b.regions)])].map((id) => ({ kind: 'kraj', id }) as MetricKey);
  return [...big(keys, cfg.topDeltas), ...big(kraje, cfg.topKraje)];
}

/** Reasons a setting change matters, besides plain metric changes: zones, pass chance, red lines, pledges. */
function changeReasons(sim: Simulation, from: Sliders, to: Sliders, before: VotePreview, after: VotePreview): AdviceReason[] {
  const out: AdviceReason[] = [];
  for (const it of shownItems(sim)) {
    const z0 = zoneOf(it, from[it.id] ?? 0);
    const z1 = zoneOf(it, to[it.id] ?? 0);
    if (z0 === z1) continue;
    if (z0 !== 'safe') out.push({ kind: 'zoneLeave', item: it.id, zone: z0 });
    if (z1 !== 'safe') out.push({ kind: 'zoneEnter', item: it.id, zone: z1 });
  }
  for (const r of violations(sim, to)) if (!before.violations.includes(r.item)) out.push({ kind: 'redLine', item: r.item, maxCutSteps: r.maxCutSteps });
  for (const item of before.violations) if (!after.violations.includes(item)) out.push({ kind: 'redLineFixed', item });
  for (const p of pledgesForBudget(sim)) {
    const c = { type: 'budget' as const, item: p.item, minSteps: p.minSteps };
    const m0 = budgetConditionMet(c, from);
    const m1 = budgetConditionMet(c, to);
    if (m0 !== m1) out.push({ kind: m1 ? 'pledgeMet' : 'pledgeBroken', item: p.item, region: p.pledge.region });
  }
  for (const r of sim.state.budgetVoteRequests ?? []) {
    const m0 = requestMet(r, from);
    const m1 = requestMet(r, to);
    if (m0 !== m1) out.push({ kind: m1 ? 'requestMet' : 'requestMissed', item: r.item, party: r.party, dir: r.dir });
  }
  const dp = after.passChance - before.passChance;
  if (Math.abs(dp) >= sim.cfg.budgetAdvice.minPassDelta) out.push({ kind: 'pass', delta: dp });
  return out;
}

/** What moving one slider to `to` does, compared with the current setting. */
export function explainStep(sim: Simulation, sliders: Sliders, presetId: string | null, item: string, to: number): StepAdvice {
  const next = { ...sliders, [item]: to };
  const nextPreset = keptPreset(sim, next, presetId);
  const before = sim.previewVote(sliders, presetId);
  const after = sim.previewVote(next, nextPreset);
  return {
    item,
    from: sliders[item] ?? 0,
    to,
    sliders: next,
    presetId: nextPreset,
    before,
    after,
    reasons: [...changeReasons(sim, sliders, next, before, after), ...metricDiffs(sim, before, after)],
  };
}

/**
 * Better settings than `target` (the inspected one: the hovered step, or the current sliders): undoing the
 * hovered step (`current`), one step on any shown slider, or a preset. Scored with the bot's vote value;
 * a move that crosses a new red line is never suggested. Best first, one card per slider.
 */
export function suggestMoves(
  sim: Simulation,
  target: Sliders,
  targetPreset: string | null,
  current?: { sliders: Sliders; presetId: string | null },
  max = sim.cfg.budgetAdvice.maxSuggestions,
): Suggestion[] {
  const { minSteps, maxSteps } = sim.cfg.budgetVote.sliders;
  const failV = budgetFailValue(sim);
  const base = sim.previewVote(target, targetPreset);
  const baseV = voteValue(sim, target, targetPreset, failV);
  const baseViol = base.violations.length;
  const cands: Omit<Suggestion, 'gain' | 'pass' | 'finances' | 'support' | 'reasons'>[] = [];
  if (current && !sameSliders(sim, current.sliders, target)) cands.push({ kind: 'keep', presetId: current.presetId, sliders: current.sliders });
  for (const it of shownItems(sim))
    for (const dir of [-1, 1] as const) {
      const v = (target[it.id] ?? 0) + dir;
      if (v < minSteps || v > maxSteps) continue;
      const s = { ...target, [it.id]: v };
      if (current && sameSliders(sim, s, current.sliders)) continue; // that is the 'keep' card
      cands.push({ kind: 'step', item: it.id, dir, presetId: keptPreset(sim, s, targetPreset), sliders: s });
    }
  for (const o of sim.data.budgetVote) {
    const s = presetSliders(sim, o.id);
    if (sameSliders(sim, s, target)) continue;
    cands.push({ kind: 'preset', presetId: o.id, sliders: s });
  }
  const scored: Suggestion[] = [];
  for (const c of cands) {
    if (validateVote(sim, c.sliders, c.presetId) !== null) continue;
    const p = sim.previewVote(c.sliders, c.presetId);
    if (p.violations.length > baseViol) continue;
    const gain = voteValue(sim, c.sliders, c.presetId, failV) - baseV;
    if (gain < sim.cfg.budgetAdvice.minGain) continue;
    scored.push({
      ...c,
      gain,
      pass: p.passChance - base.passChance,
      finances: mid(p.resources.finances) - mid(base.resources.finances),
      support: mid(p.resources.support) - mid(base.resources.support),
      reasons: [...changeReasons(sim, target, c.sliders, base, p), ...metricDiffs(sim, base, p)],
    });
  }
  scored.sort((a, b) => b.gain - a.gain || (a.item ?? a.presetId ?? '').localeCompare(b.item ?? b.presetId ?? ''));
  // undoing the inspected step always gets a card when it helps; at most one preset; one card per slider
  const keep = scored.find((s) => s.kind === 'keep');
  const out: Suggestion[] = keep && max > 0 ? [keep] : [];
  const usedItems = new Set<string>();
  let presets = 0;
  for (const s of scored) {
    if (out.length >= max) break;
    if (s === keep) continue;
    if (s.kind === 'preset' && presets++ >= 1) continue;
    if (s.item) {
      if (usedItems.has(s.item)) continue;
      usedItems.add(s.item);
    }
    out.push(s);
  }
  return out.sort((a, b) => b.gain - a.gain);
}

/** The state of the whole vote when nothing is inspected: open risks and the best single move. */
export function summarizeBudget(sim: Simulation, sliders: Sliders, presetId: string | null): { risks: AdviceReason[]; passChance: number; best: Suggestion | null } {
  const p = sim.previewVote(sliders, presetId);
  const risks: AdviceReason[] = [];
  for (const r of violations(sim, sliders)) risks.push({ kind: 'redLine', item: r.item, maxCutSteps: r.maxCutSteps });
  for (const it of shownItems(sim)) {
    const z = zoneOf(it, sliders[it.id] ?? 0);
    if (z !== 'safe') risks.push({ kind: 'zoneEnter', item: it.id, zone: z });
  }
  for (const r of sim.state.budgetVoteRequests ?? []) if (!requestMet(r, sliders)) risks.push({ kind: 'requestMissed', item: r.item, party: r.party, dir: r.dir });
  for (const pl of pledgesForBudget(sim))
    if (!budgetConditionMet({ type: 'budget', item: pl.item, minSteps: pl.minSteps }, sliders)) risks.push({ kind: 'pledgeBroken', item: pl.item, region: pl.pledge.region });
  return { risks, passChance: p.passChance, best: suggestMoves(sim, sliders, presetId, undefined, 1)[0] ?? null };
}

/** Where one metric's number comes from: each moved slider's share (and the rest: preset base effects). */
export function explainMetric(
  sim: Simulation,
  sliders: Sliders,
  presetId: string | null,
  metric: MetricKey,
): { total: number; parts: { item: string; delta: number }[]; rest: number; tip: { item: string; dir: 1 | -1; delta: number } | null } {
  const { minSteps, maxSteps } = sim.cfg.budgetVote.sliders;
  const total = metricValue(sim.previewVote(sliders, presetId), metric);
  const parts: { item: string; delta: number }[] = [];
  for (const it of shownItems(sim)) {
    if ((sliders[it.id] ?? 0) === 0) continue;
    const without = { ...sliders, [it.id]: 0 };
    const d = total - metricValue(sim.previewVote(without, keptPreset(sim, without, presetId)), metric);
    if (Math.abs(d) >= 1e-9) parts.push({ item: it.id, delta: d });
  }
  parts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.item.localeCompare(b.item));
  const rest = total - parts.reduce((s, p) => s + p.delta, 0);
  // the single step that moves this metric most in the player's favour (without crossing a new red line)
  const good = metricUpIsGood(metric) ? 1 : -1;
  const baseViol = violations(sim, sliders).length;
  let tip: { item: string; dir: 1 | -1; delta: number } | null = null;
  for (const it of shownItems(sim))
    for (const dir of [-1, 1] as const) {
      const v = (sliders[it.id] ?? 0) + dir;
      if (v < minSteps || v > maxSteps) continue;
      const s = { ...sliders, [it.id]: v };
      if (violations(sim, s).length > baseViol) continue;
      const d = metricValue(sim.previewVote(s, keptPreset(sim, s, presetId)), metric) - total;
      if (d * good > sim.cfg.budgetAdvice.minDelta - 1e-9 && (!tip || d * good > tip.delta * good)) tip = { item: it.id, dir, delta: d };
    }
  return { total, parts, rest, tip };
}
