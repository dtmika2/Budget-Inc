/**
 * Every tunable number in the game (spec §13). Difficulty presets included.
 * Balance values are provisional while filler cards stand in for real content (see DECISIONS.md).
 */
import type { DifficultyId, GroupId, ResourceId } from './core/types';

export interface DifficultyPreset {
  chaosMultiplier: number;
  negativeMultiplier: number;
  T_base: number;
  driftMultiplier: number;
}

export const config = {
  /** Load generated `[FILLER]` content (files starting with `_`). Turn off once real content meets §5.3. */
  includeDevFiller: true,

  time: {
    daysPerQuarter: 91,
    quarters: 16,
    startDate: '2025-10-04',
    msPerDayAt1x: 700,
    maxTicksPerFrame: 4,
    speeds: [1, 2, 4] as number[],
    defaultSpeed: 1,
    yearStartQuarters: [1, 5, 9, 13] as number[],
  },

  /** Baseline drift per day (§4.2). */
  // P9 balance: support -0.05 -> -0.07, coalition -0.03 -> -0.015 (see DECISIONS.md Balance log)
  drift: { finances: 0, support: -0.07, coalition: -0.015, prestige: 0 } as Record<ResourceId, number>,

  anger: {
    /** Daily pull toward the leader's starting value (§4.3). 0 disables. */
    pullPerDay: 0.02,
    trendWindowDays: 7,
    trendThreshold: 1,
    pulseAt: 70,
    warnAt: 90,
    rearmBelow: 80,
    max: 100,
  },

  zeroPenalty: {
    exitAt: 3,
    isolationFinanceCap: -15,
    effects: {
      finances: [
        { target: 'anger.eu', perDay: 0.3 },
        { target: 'anger.pensioners', perDay: 0.3 },
        { target: 'prestige', perDay: -0.1 },
      ],
      support: [
        { target: 'anger.activists', perDay: 0.3 },
        { target: 'coalition', perDay: -0.15 },
      ],
      prestige: [
        { target: 'anger.eu', perDay: 0.4 },
        { target: 'financeMod', perDay: -0.1 },
      ],
    } as Record<'finances' | 'support' | 'prestige', { target: string; perDay: number }[]>,
  },

  election: {
    k: 8,
    regionalNoise: 3,
    seatsPerPoint: 3,
    totalSeats: 200,
    majority: 101,
    angerThreshold: 50,
    angerScale: 50,
    groupWeights: { oligarchs: 10, pensioners: 10, media: 4, eu: 3, activists: 3 } as Record<GroupId, number>,
    projectionEveryDays: 7,
  },

  /** Regional politics: per-kraj support shifts on top of national support. */
  regions: {
    /**
     * Seeded per-run jitter of regional support at the start (uniform +-startJitter, then re-centred so
     * the seat-weighted national average is unchanged). 0 = every kraj starts equal.
     */
    startJitter: 6,
    /** Cap on a region's accumulated shift (+-). */
    maxShift: 40,
  },

  finances: {
    /** Finances points per 1 % of original expenditure of balance change (§9.3). */
    scale: 5,
  },

  budgetVote: {
    enabled: true,
    day: 75,
    quarters: [1, 5, 9, 13] as number[],
    mandatoryGrowthPct: 2,
    passBase: 0.75,
    passMin: 0.05,
    passMax: 0.98,
    failEffects: { coalition: -8, prestige: -3, support: -2 } as Partial<Record<ResourceId, number>>,
  },

  draft: {
    handSize: 3,
    repeatCooldownQuarters: 4,
    /** [OPEN] what pays for rerolls: placeholder is Political Capital. */
    rerollCurrency: 'pc' as const,
    rerollBaseCost: 1,
    rerollCostFactor: 2,
    /** Chance that a hand swaps one policy slot for a regional compromise card (0 disables). */
    compromiseChance: 0.6,
    /** Compromise cards picked within this many quarters are not offered again (unless none are left). */
    compromiseCooldownQuarters: 6,
  },

  pc: {
    start: 0,
    perQuarter: 2,
    supportBonusThreshold: 60,
    supportBonus: 1,
  },

  abilities: {
    chargesPerYear: 1,
    rechargeQuarters: [5, 9, 13] as number[],
  },

  chaos: {
    maxQuarterOffset: 3,
  },

  popups: {
    popupSeconds: 5,
    responseTimeoutSec: 12,
    maxVisibleDesktop: 3,
    maxVisibleMobile: 2,
  },

  opportunities: {
    perQuarter: 3,
    spawnFromDay: 5,
    spawnToDay: 85,
    lifetimeDays: 12,
  },

  score: {
    win: 1000,
    pFinal: 400,
    perQuarter: 25,
    resourceWeight: 1,
    angerWeight: 0.5,
    keyDecisions: 5,
    angerImpactWeight: 0.5,
  },

  difficulty: {
    easy: { chaosMultiplier: 0.7, negativeMultiplier: 0.8, T_base: 42, driftMultiplier: 0.7 },
    normal: { chaosMultiplier: 1.0, negativeMultiplier: 1.0, T_base: 45, driftMultiplier: 1.0 },
    hard: { chaosMultiplier: 1.2, negativeMultiplier: 1.15, T_base: 48, driftMultiplier: 1.2 },
  } as Record<DifficultyId, DifficultyPreset>,
  defaultDifficulty: 'normal' as DifficultyId,

  /** Content validator thresholds (§5.3). */
  content: {
    warnCardsPerLeader: 18,
    minCardsPerLeader: 3,
  },

  /** Bounds for scripts/gen-filler-cards.ts (balanced so filler is roughly net-neutral). */
  filler: {
    seed: 'budget-inc-filler-v1',
    cardsPerLeader: 22,
    sharedCards: 0,
    primaryGain: { min: 2, max: 6 },
    secondary: { min: -4, max: 3 },
    angerUp: { min: 3, max: 9 },
    angerDown: { min: -8, max: -3 },
    budgetPct: { min: 1, max: 5 },
    ongoingShare: 0.3,
    ongoingPerDay: { min: 0.02, max: 0.06 },
    ongoingDays: { min: 60, max: 180 },
    eventChance: { min: 0.3, max: 0.6 },
    eventLoss: { min: 2, max: 6 },
    eventAnger: { min: 2, max: 6 },
    respondableShare: 1 / 3,
    /** Generated [FILLER] compromises (available to both leaders). */
    compromises: 16,
    regionGain: { min: 3, max: 8 },
    regionLoss: { min: 2, max: 6 },
    compromiseFinanceCost: { min: 1, max: 4 },
    compromiseOligarchs: { min: 5, max: 9 },
  },

  /** Simulator targets on Normal (§13). */
  simulatorTargets: {
    randomMaxWinRate: 0.15,
    greedyMinWinRate: 0.2,
    greedyMaxWinRate: 0.4,
  },
};

export type Config = typeof config;
