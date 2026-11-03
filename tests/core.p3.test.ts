import { describe, expect, it } from 'vitest';
import { presetVote } from '../src/core/bots';
import { config } from '../src/config';
import { drawHand, rerollCost } from '../src/core/draft';
import { Rng } from '../src/core/rng';
import type { LeaningId, PolicyCard } from '../src/core/types';
import { LEANING_IDS } from '../src/core/types';
import { advanceQuiet, cfgWith, gameData, makeSim, quietSim } from './helpers';

const mupkaCards = () => gameData().policies.filter((c) => c.availableFor.includes('mupka'));
const weights = () => gameData().leaders.find((l) => l.id === 'mupka')!.leaningWeights;

function card(id: string, leaning: LeaningId = 'populism'): PolicyCard {
  return { id, leaning, availableFor: ['x'], title: '', description: '', drivenBy: '', chaosEvents: [], devOnly: false };
}

const baseInput = (cards: PolicyCard[]) => ({
  cards,
  weights: weights(),
  picked: [] as { cardId: string; quarter: number }[],
  shownThisQuarter: [] as string[],
  quarter: 1,
  repeatCooldownQuarters: 4,
  handSize: 3,
});

describe('draft', () => {
  it('leaning frequencies match renormalised weights over available leanings (10k draws)', () => {
    const cards = mupkaCards();
    const w = weights();
    const present = LEANING_IDS.filter((l) => cards.some((c) => c.leaning === l));
    const sum = present.reduce((s, l) => s + w[l], 0);
    const counts: Record<string, number> = {};
    const rng = new Rng('weights');
    const N = 10000;
    for (let i = 0; i < N; i++) {
      const { hand } = drawHand({ ...baseInput(cards), handSize: 1 }, rng);
      const l = cards.find((c) => c.id === hand[0])!.leaning;
      counts[l] = (counts[l] ?? 0) + 1;
    }
    for (const l of present) expect(Math.abs((counts[l] ?? 0) / N - w[l] / sum)).toBeLessThan(0.015);
  });

  it('renormalises when a leaning has no eligible cards', () => {
    const cards = [card('a', 'libertarianism'), card('b', 'communism')];
    const rng = new Rng('renorm');
    let lib = 0;
    for (let i = 0; i < 5000; i++) if (drawHand({ ...baseInput(cards), handSize: 1 }, rng).hand[0] === 'a') lib++;
    // mupka: libertarianism 35 vs communism 2
    expect(lib / 5000).toBeCloseTo(35 / 37, 1);
  });

  it('never deals duplicates in a hand', () => {
    const rng = new Rng('dups');
    for (let i = 0; i < 2000; i++) {
      const { hand } = drawHand(baseInput(mupkaCards()), rng);
      expect(new Set(hand).size).toBe(3);
    }
  });

  it('relaxation level 1: allows cards shown earlier this quarter', () => {
    const cards = ['a', 'b', 'c', 'd'].map((id) => card(id));
    const r = drawHand({ ...baseInput(cards), shownThisQuarter: ['a', 'b'] }, new Rng('l1'));
    expect(r.relaxLevel).toBe(1);
    expect(new Set(r.hand).size).toBe(3);
  });

  it('relaxation level 2: allows old picks, oldest first', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => card(id));
    const r = drawHand(
      {
        ...baseInput(cards),
        quarter: 9,
        picked: [
          { cardId: 'c', quarter: 3 },
          { cardId: 'd', quarter: 1 },
          { cardId: 'e', quarter: 8 },
        ],
      },
      new Rng('l2'),
    );
    expect(r.relaxLevel).toBe(2);
    expect(r.hand).toContain('d'); // oldest pick
    expect(r.hand).not.toContain('e'); // too recent
  });

  it('relaxation level 3: any available card not in hand', () => {
    const cards = ['a', 'b', 'c'].map((id) => card(id));
    const picked = cards.map((c) => ({ cardId: c.id, quarter: 8 }));
    const r = drawHand({ ...baseInput(cards), quarter: 9, picked }, new Rng('l3'));
    expect(r.relaxLevel).toBe(3);
    expect(r.hand.sort()).toEqual(['a', 'b', 'c']);
  });

  it('a 16-quarter run with 18 cards never relaxes without rerolls', () => {
    const cards = mupkaCards().slice(0, 18);
    const rng = new Rng('18cards');
    const picked: { cardId: string; quarter: number }[] = [];
    for (let q = 1; q <= 16; q++) {
      const r = drawHand({ ...baseInput(cards), quarter: q, picked }, rng);
      expect(r.relaxLevel).toBe(0);
      picked.push({ cardId: r.hand[0], quarter: q });
    }
  });

  it('logs pool_relaxed in a full run with a tiny pool', () => {
    const data = { ...gameData(), policies: gameData().policies.filter((c) => c.id.startsWith('dummy_')) };
    const sim = makeSim({ seed: 'tiny' }, config, data);
    // 6 cards: Q1-Q4 hands fit (6,5,4,3 unpicked); Q5 has 2 left and must relax
    sim.state.resources.coalition = 100;
    advanceQuiet(sim, 91 * 4 + 1);
    expect(sim.state.quarter).toBeGreaterThanOrEqual(5);
    expect(sim.state.log.some((e) => e.type === 'pool_relaxed')).toBe(true);
  });
});

describe('rerolls', () => {
  it('cost curve is 1, 2, 4, 8', () => {
    expect([0, 1, 2, 3].map((n) => rerollCost(n, 1, 2))).toEqual([1, 2, 4, 8]);
  });

  it('escalates within a quarter, resets next quarter, and never re-deals rerolled cards', () => {
    const sim = makeSim({ seed: 'reroll' });
    sim.state.pc = 20;
    const first = [...sim.state.draft!.hand];
    expect(sim.dispatch({ kind: 'reroll' }).ok).toBe(true);
    expect(sim.state.pc).toBe(19);
    expect(sim.state.draft!.hand.some((id) => first.includes(id))).toBe(false);
    sim.dispatch({ kind: 'reroll' });
    expect(sim.state.pc).toBe(17);
    sim.dispatch({ kind: 'reroll' });
    expect(sim.state.pc).toBe(13);
    expect(sim.currentRerollCost()).toBe(8);
    sim.dispatch({ kind: 'pickPolicy', cardId: sim.state.draft!.hand[0] });
    sim.state.resources.coalition = 100;
    while (sim.state.quarter === 1 && !sim.isOver) {
      if (sim.state.phase === 'budgetVote') sim.dispatch(presetVote(sim, 'budget_balanced'));
      else if (sim.state.phase === 'compromise') sim.dispatch({ kind: 'makeCompromise', cardId: sim.state.compromiseOffer![0] });
      else sim.tick();
    }
    expect(sim.state.quarter).toBe(2);
    expect(sim.state.phase).toBe('draft');
    expect(sim.currentRerollCost()).toBe(1);
  });

  it('rejects an unaffordable reroll', () => {
    const sim = makeSim({ seed: 'poor' });
    sim.state.pc = 0;
    expect(sim.dispatch({ kind: 'reroll' }).ok).toBe(false);
  });
});

describe('political capital', () => {
  it('+2 per quarter, +1 with support >= 60, +1 with Regional Tours', () => {
    const sim = quietSim();
    expect(sim.state.pc).toBe(2); // Q1 grant
    sim.state.pc = 0;
    sim.state.resources.support = 70;
    sim.state.ownedUpgrades.push('sup_campaign_office');
    sim.state.pc = 3;
    expect(sim.dispatch({ kind: 'buyUpgrade', nodeId: 'sup_regional_tours' }).ok).toBe(true);
    expect(sim.state.pc).toBe(0);
    sim.state.schedule = sim.state.schedule.filter((e) => e.kind !== 'budgetVote');
    while (sim.state.quarter === 1) sim.tick();
    const granted = sim.state.log.filter((e) => e.type === 'quarter_started').at(-1)!;
    expect(granted.pcGained).toBe(2 + 1 + 1);
  });
});

describe('abilities', () => {
  it('Campaign Mode: support +10, media +5, one charge per year, recharges at Q5', () => {
    const sim = quietSim({ leader: 'abis' });
    const s0 = sim.state.resources.support;
    const m0 = sim.state.anger.media;
    expect(sim.dispatch({ kind: 'useAbility' }).ok).toBe(true);
    expect(sim.state.resources.support - s0).toBeCloseTo(10);
    expect(sim.state.anger.media - m0).toBeCloseTo(5);
    expect(sim.dispatch({ kind: 'useAbility' }).ok).toBe(false);
    advanceQuiet(sim, 91 * 3);
    expect(sim.state.quarter).toBe(4);
    expect(sim.state.abilityCharges).toBe(0);
    advanceQuiet(sim, 91);
    expect(sim.state.quarter).toBe(5);
    expect(sim.state.abilityCharges).toBe(1);
  });

  it('charges do not stack', () => {
    const sim = quietSim({ leader: 'abis' });
    advanceQuiet(sim, 91 * 4);
    expect(sim.state.quarter).toBe(5);
    expect(sim.state.abilityCharges).toBe(1);
  });

  it('Austerity Freeze halves worsening budget changes for 30 days, already-applied changes stay', () => {
    const sim = quietSim({ leader: 'mupka' });
    expect(sim.dispatch({ kind: 'useAbility' }).ok).toBe(true);
    const fin = sim.previewCard('dummy_expenditure').resources.finances!;
    const cfgNoFreeze = quietSim({ leader: 'mupka', seed: 'other' });
    const finNoFreeze = cfgNoFreeze.previewCard('dummy_expenditure').resources.finances!;
    expect(fin.min).toBeCloseTo(finNoFreeze.min / 2, 6);
    advanceQuiet(sim, 30);
    expect(sim.state.modifiers.some((m) => m.origin === 'ability:austerity_freeze')).toBe(false);
    expect(sim.previewCard('dummy_expenditure').resources.finances!.min).toBeCloseTo(finNoFreeze.min, 6);
  });

  it('Austerity Freeze halves mandatory growth at the vote', () => {
    const a = quietSim({ seed: 'af' });
    const b = quietSim({ seed: 'af' });
    a.state.day = 70;
    b.state.day = 70;
    a.dispatch({ kind: 'useAbility' });
    while (a.state.phase === 'running') a.tick();
    while (b.state.phase === 'running') b.tick();
    expect(a.state.budget.expPct['313']).toBeCloseTo(b.state.budget.expPct['313'] / 2);
  });
});

describe('card preview', () => {
  it('Finances range is the exact budget delta and matches the applied change', () => {
    const sim = makeSim({ seed: 'preview' });
    const E0 = sim.data.budget.chapters.reduce((s, c) => s + c.expenditure, 0);
    const p = sim.previewCard('dummy_revenue').resources.finances!;
    const expected = (config.finances.scale * -0.03 * 1650e9 * 100) / E0;
    expect(p.min).toBeCloseTo(expected, 6);
    expect(p.max).toBeCloseTo(expected, 6);
    if (sim.state.draft!.hand.includes('dummy_revenue')) {
      const f0 = sim.state.resources.finances;
      sim.dispatch({ kind: 'pickPolicy', cardId: 'dummy_revenue' });
      expect(sim.state.resources.finances - f0).toBeCloseTo(expected, 6);
    }
  });

  it('includes the global negative multiplier (Brutal)', () => {
    const normal = makeSim({ seed: 'p', difficulty: 'normal' }).previewCard('dummy_respondable');
    const hard = makeSim({ seed: 'p', difficulty: 'hard' }).previewCard('dummy_respondable');
    expect(hard.anger.media!.max).toBeCloseTo(normal.anger.media!.max * config.difficulty.hard.negativeMultiplier);
    expect(hard.resources.support!.max).toBeCloseTo(normal.resources.support!.max); // gains unaffected
  });

  it('a different budget file changes Finances without code changes', () => {
    const data = gameData();
    const alt = { ...data, budget: { ...data.budget, chapters: data.budget.chapters.map((c) => ({ ...c, revenue: c.revenue * 2 })) } };
    const a = makeSim({ seed: 'b' }, cfgWith(() => {}), alt).previewCard('dummy_revenue').resources.finances!;
    const b = makeSim({ seed: 'b' }).previewCard('dummy_revenue').resources.finances!;
    expect(a.min).toBeCloseTo(b.min * 2, 6);
  });
});
