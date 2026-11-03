/**
 * Budget model (spec §9.3). Each chapter keeps running totals revPct / expPct: the sum of every applied
 * changePct, always relative to the ORIGINAL value in the file. Changes add up; they do not compound.
 */
import type { BudgetData, GameState } from './types';

export type PctState = GameState['budget'];

export function initPct(budget: BudgetData): PctState {
  const revPct: Record<string, number> = {};
  const expPct: Record<string, number> = {};
  for (const c of budget.chapters) {
    revPct[c.code] = 0;
    expPct[c.code] = 0;
  }
  return { revPct, expPct };
}

export interface BudgetTotals {
  revenue: number;
  expenditure: number;
  balance: number;
  chapters: { code: string; revenue: number; expenditure: number; revPct: number; expPct: number }[];
}

export function totals(budget: BudgetData, pct: PctState): BudgetTotals {
  let revenue = 0;
  let expenditure = 0;
  const chapters = budget.chapters.map((c) => {
    const r = Math.max(0, c.revenue * (1 + (pct.revPct[c.code] ?? 0) / 100));
    const e = Math.max(0, c.expenditure * (1 + (pct.expPct[c.code] ?? 0) / 100));
    revenue += r;
    expenditure += e;
    return { code: c.code, revenue: r, expenditure: e, revPct: pct.revPct[c.code] ?? 0, expPct: pct.expPct[c.code] ?? 0 };
  });
  return { revenue, expenditure, balance: revenue - expenditure, chapters };
}

export function originalTotals(budget: BudgetData): { balance0: number; E0: number } {
  let r = 0;
  let e = 0;
  for (const c of budget.chapters) {
    r += c.revenue;
    e += c.expenditure;
  }
  return { balance0: r - e, E0: e };
}

/** Finance points contributed by the budget alone (unclamped): scale * (balance_t - balance_0) / E_0 * 100. */
export function budgetTerm(budget: BudgetData, pct: PctState, scale: number): number {
  const { balance0, E0 } = originalTotals(budget);
  if (E0 === 0) return 0;
  return (scale * (totals(budget, pct).balance - balance0) * 100) / E0;
}

export function computeFinances(
  budget: BudgetData,
  pct: PctState,
  scale: number,
  start: number,
  financesExtra: number,
  financeModAccum: number,
): number {
  const raw = start + budgetTerm(budget, pct, scale) + financesExtra + financeModAccum;
  return Math.min(100, Math.max(0, raw));
}

/** Add an (already pipeline-scaled) changePct to one chapter or to all (`*`). Mutates `pct`. */
export function applyPct(budget: BudgetData, pct: PctState, chapter: string, type: 'revenue' | 'expenditure', changePct: number): void {
  const codes = chapter === '*' ? budget.chapters.map((c) => c.code) : [chapter];
  const bucket = type === 'revenue' ? pct.revPct : pct.expPct;
  for (const code of codes) bucket[code] = (bucket[code] ?? 0) + changePct;
}

export function clonePct(pct: PctState): PctState {
  return { revPct: { ...pct.revPct }, expPct: { ...pct.expPct } };
}
