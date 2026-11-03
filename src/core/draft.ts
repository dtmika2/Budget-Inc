/** Quarterly draft (spec §5.3): weighted leaning -> uniform card, with 3 relaxation levels. */
import type { Rng } from './rng';
import type { CompromiseCard, LeaningId, PolicyCard } from './types';

export interface DraftInput {
  /** Cards available to the current leader. */
  cards: readonly PolicyCard[];
  weights: Record<LeaningId, number>;
  picked: readonly { cardId: string; quarter: number }[];
  shownThisQuarter: readonly string[];
  quarter: number;
  repeatCooldownQuarters: number;
  handSize: number;
}

export interface DraftResult {
  hand: string[];
  /** Highest relaxation level used (0 = none). */
  relaxLevel: 0 | 1 | 2 | 3;
}

/** Leaning by renormalised weights over leanings that still have cards, then a uniform card. */
export function weightedPick(pool: readonly PolicyCard[], weights: Record<LeaningId, number>, rng: Rng): PolicyCard {
  const leanings: LeaningId[] = [];
  for (const c of pool) if (!leanings.includes(c.leaning)) leanings.push(c.leaning);
  let w = leanings.map((l) => weights[l] ?? 0);
  if (w.every((x) => x <= 0)) w = leanings.map(() => 1);
  const leaning = leanings[rng.weightedIndex(w)];
  const cards = pool.filter((c) => c.leaning === leaning);
  return cards[Math.floor(rng.next() * cards.length)];
}

export function drawHand(input: DraftInput, rng: Rng): DraftResult {
  const { cards, weights, picked, shownThisQuarter, quarter, repeatCooldownQuarters, handSize } = input;
  const lastPick = new Map<string, number>();
  for (const p of picked) lastPick.set(p.cardId, Math.max(lastPick.get(p.cardId) ?? -Infinity, p.quarter));
  const shown = new Set(shownThisQuarter);
  const hand: PolicyCard[] = [];
  let level: 0 | 1 | 2 | 3 = 0;

  const notInHand = (c: PolicyCard) => !hand.includes(c);
  const neverPicked = (c: PolicyCard) => !lastPick.has(c.id);

  while (hand.length < handSize) {
    if (level === 0) {
      const pool = cards.filter((c) => notInHand(c) && neverPicked(c) && !shown.has(c.id));
      if (pool.length) {
        hand.push(weightedPick(pool, weights, rng));
        continue;
      }
      level = 1;
    }
    if (level === 1) {
      const pool = cards.filter((c) => notInHand(c) && neverPicked(c));
      if (pool.length) {
        hand.push(weightedPick(pool, weights, rng));
        continue;
      }
      level = 2;
    }
    if (level === 2) {
      // never-picked cards are exhausted here; allow old picks, oldest pick first
      const old = cards
        .filter((c) => notInHand(c) && lastPick.has(c.id) && (lastPick.get(c.id) as number) <= quarter - repeatCooldownQuarters)
        .sort((a, b) => (lastPick.get(a.id) as number) - (lastPick.get(b.id) as number));
      if (old.length) {
        hand.push(old[0]);
        continue;
      }
      level = 3;
    }
    const pool = cards.filter(notInHand);
    if (!pool.length) break; // fewer cards than a hand: the validator prevents this
    hand.push(weightedPick(pool, weights, rng));
  }
  return { hand: hand.map((c) => c.id), relaxLevel: level };
}

export function rerollCost(rerollsSoFar: number, base: number, factor: number): number {
  return base * Math.pow(factor, rerollsSoFar);
}

/**
 * Up to `n` distinct regional compromises for a compromise decision. Preference order: not picked within
 * the cooldown and never picked; then cooled-down earlier picks (oldest first); then anything left.
 * Uniform within the never-picked tier.
 */
export function drawCompromises(
  cards: readonly CompromiseCard[],
  picked: readonly { cardId: string; quarter: number }[],
  quarter: number,
  cooldownQuarters: number,
  n: number,
  rng: Rng,
): string[] {
  const last = new Map<string, number>();
  for (const p of picked) last.set(p.cardId, Math.max(last.get(p.cardId) ?? -Infinity, p.quarter));
  const fresh = cards.filter((c) => !last.has(c.id));
  const cooled = cards
    .filter((c) => last.has(c.id) && (last.get(c.id) as number) <= quarter - cooldownQuarters)
    .sort((a, b) => (last.get(a.id) as number) - (last.get(b.id) as number));
  const rest = cards.filter((c) => !fresh.includes(c) && !cooled.includes(c));
  const out: string[] = [];
  const pool = [...fresh];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0].id);
  for (const c of [...cooled, ...rest]) if (out.length < n && !out.includes(c.id)) out.push(c.id);
  return out;
}
