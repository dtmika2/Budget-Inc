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

export interface CompromiseChannel {
  gainAtZero: number;
  gainAtOne: number;
  lossAtZero: number;
  lossAtOne: number;
  /** Usable once per game year (Q1-4, Q5-8, ...). */
  oncePerYear: boolean;
  /** The UI offers a Skip button (scored as compromise.skipScore). */
  skippable: boolean;
}

export const config = {
  /** Load generated `[FILLER]` content (files starting with `_`). Turn off once real content meets §5.3. */
  includeDevFiller: true,

  /** Background music (0–1). */
  music: { volume: 0.35 },
  /** Opened only when the player clicks them. */
  links: { coffee: 'https://buymeacoffee.com/budgetinc' },

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

  /**
   * Interest-group pressure (P24, stakeholder feedback): a group's anger above `from` drains the key
   * attributes every day. Drain per day = perDayAtMax x weight x (anger - from) / (100 - from), so a 1x link
   * costs perDayAtMax per day at anger 100 and nothing at `from` or below.
   */
  groupPressure: {
    from: 50,
    perDayAtMax: 0.05,
    weights: {
      oligarchs: { finances: 1, support: 0.5 },
      pensioners: { support: 1, prestige: 0.33 },
      media: { support: 1, coalition: 0.33, prestige: 0.5 },
      eu: { finances: 1.3, prestige: 0.33 },
      activists: { prestige: 1.33 },
    } as Record<GroupId, Partial<Record<ResourceId, number>>>,
  },

  /**
   * Prestige bonuses (P24): every `everyDays` days, with Prestige >= `from`, a chance of a bonus (own RNG
   * stream `prestige`). chance = chanceAtFrom + (prestige - from) x chancePerPoint, at most chanceMax. The bonus
   * kind is drawn by weight: Support, Coalition (the partner likes you), or the angriest group calms down.
   */
  prestigeBonus: {
    from: 60,
    everyDays: 30,
    chanceAtFrom: 0.2,
    chancePerPoint: 0.01,
    chanceMax: 0.6,
    kinds: {
      support: { weight: 1, value: 1.5 },
      coalition: { weight: 1, value: 2 },
      group: { weight: 1, value: -6 },
    },
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
    /** Phase 13: region traits. Every region has one settlement trait, one economy trait, optionally one special. */
    traits: {
      settlement: ['urban', 'mixed', 'rural'],
      economy: ['industry', 'services', 'agriculture', 'tourism'],
      special: ['coal', 'border', 'university'],
    } as Record<'settlement' | 'economy' | 'special', string[]>,
    /** Opacity of the Czech flag between the map's glass and its liquid (0–1). */
    flagOpacity: 0.6,
    /** Length of the flag's fade in and out after a decision, at 1x (the map's animations follow the game speed). */
    flagPulseMs: 4000,
    /** Hidden card tags that traits react to. */
    tags: ['agriculture', 'industry', 'transport', 'services', 'tourism', 'environment', 'education', 'social', 'coal', 'border'] as string[],
    /**
     * How strongly a region reacts to a tagged card: multiplier per trait and tag (missing = 1). The product
     * over the region's traits and the card's tags scales the card's regional effects and adds
     * support x (mult - 1) to the region's shift (national support itself is unchanged).
     */
    traitResponse: {
      urban: { agriculture: 0.7, transport: 1.2, services: 1.2, environment: 1.2, education: 1.1 },
      mixed: {},
      rural: { agriculture: 1.3, services: 0.8, social: 1.2, environment: 0.9 },
      industry: { industry: 1.4, environment: 0.8 },
      services: { services: 1.3 },
      agriculture: { agriculture: 1.5 },
      tourism: { tourism: 1.5, transport: 1.1 },
      coal: { coal: 1.6, environment: 0.6, industry: 1.2 },
      border: { border: 1.4, tourism: 1.1 },
      university: { education: 1.4 },
    } as Record<string, Record<string, number>>,
    /**
     * Region screen cohorts (regions workspace, display only): how much of each interest group in a kraj is
     * angry = national anger x the product of these per-trait multipliers (missing = 1); the rest splits
     * into supporters and neutral by the kraj's regional support.
     */
    groupAffinity: {
      urban: { media: 1.2, activists: 1.2, pensioners: 0.9 },
      mixed: {},
      rural: { pensioners: 1.2, activists: 0.8, eu: 1.1 },
      industry: { oligarchs: 1.2 },
      services: { media: 1.1 },
      agriculture: { eu: 1.2 },
      tourism: {},
      coal: { oligarchs: 1.3, activists: 1.2 },
      border: { eu: 1.2 },
      university: { activists: 1.4 },
    } as Record<string, Partial<Record<GroupId, number>>>,
    /** Cap on the angry share of a group (%). */
    maxAngryShare: 95,
    /** Region screen: how many entries the "biggest impact" list shows. */
    topEffects: 5,
  },

  /**
   * Regional compromise decision: separate from the policy draft. Mid-quarter the game pauses and offers
   * `choices` compromise cards against each other; the player must pick one ("ucinit kompromis").
   */
  compromise: {
    /** Chance per quarter that a compromise decision happens (rolled at quarter start; 0 disables). */
    chance: 0.75,
    /** Day of the quarter it opens on (the budget vote is on day 75). */
    day: 45,
    /** Number of compromise cards offered against each other. */
    choices: 2,
    /** Compromises picked within this many quarters are not offered again (unless too few are left). */
    cooldownQuarters: 6,
    /**
     * Phase 12: after picking a deal the player sells it through a channel (a mini-game scoring 0..1).
     * The score scales the deal: gains x gainMult, losses x lossMult. Each multiplier is piecewise linear
     * through (0, atZero), (neutralScore, 1), (1, atOne), so a score of neutralScore gives the plain deal.
     * A negative gain multiplier turns gains into losses (the regional tour can backfire).
     */
    neutralScore: 0.5,
    /** Score used when the player skips a skippable mini-game. */
    skipScore: 0.4,
    channels: {
      press: { gainAtZero: 0.8, gainAtOne: 1.2, lossAtZero: 1.2, lossAtOne: 0.8, oncePerYear: false, skippable: true },
      debate: { gainAtZero: 0.4, gainAtOne: 1.3, lossAtZero: 1.6, lossAtOne: 0.5, oncePerYear: false, skippable: true },
      tour: { gainAtZero: -0.5, gainAtOne: 1.5, lossAtZero: 1.8, lossAtOne: 0.5, oncePerYear: true, skippable: false },
    } as Record<string, CompromiseChannel>,
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
    /** Budget sliders (phase 11): one step changes a category's spending by stepPct %. */
    sliders: { minSteps: -3, maxSteps: 3, stepPct: 10 },
    /** Categories shown per vote: `core` drawn from the core ones, `extra` from the rest (pledged ones forced in). */
    /** P31: 3 + 5 (was 2 + 4) so the slider column fills the screen and there are more areas to work with. */
    hand: { core: 3, extra: 5 },
    /** Re-roll of the shown categories: costs baseCost x factor^rerolls PC (like the policy draft). */
    reroll: { baseCost: 1, factor: 2 },
    /** Multiplier on every category's effectsPerStep, angerPerStep and passPerStep. */
    impact: 1.5,
    /**
     * Coalition red lines: at vote open, min..max categories (with canBeRedLine) are drawn from the
     * budgetVote stream. Cutting one by more than maxCutSteps steps is a violation; each violation lowers
     * the pass chance by passPenalty.
     */
    redLines: { min: 1, max: 2, maxCutSteps: 1, passPenalty: 0.2 },
    /**
     * Coalition partners' requests (P30, Daniel: huge impact on passing): each partner asks for perParty.min..max
     * of the shown areas to be raised or cut (data/annual/coalition_requests.json, `coalition` RNG stream). A met
     * request adds metBonus to the pass chance, a missed one subtracts missPenalty; a passed vote gives Coalition
     * coalitionPerMet per met request.
     */
    requests: { enabled: true, perParty: { min: 1, max: 2 }, metBonus: 0.1, missPenalty: 0.12, coalitionPerMet: 1 },
  },

  /**
   * Budget vote commentary (phase 23): explanations and recommendations next to the sliders. Advice is
   * computed from previews only (no RNG). Recommendations are scored like the greedy bot's vote.
   */
  budgetAdvice: {
    /** Recommendation cards shown at most. */
    maxSuggestions: 3,
    /** A recommendation must beat the inspected setting by at least this much expected value. */
    minGain: 0.001,
    /** Largest resource / group deltas named in an explanation, and kraje on top of them. */
    topDeltas: 3,
    topKraje: 2,
    /** Deltas smaller than this are not mentioned. */
    minDelta: 0.25,
    /** Pass-chance changes smaller than this (fraction) are not mentioned. */
    minPassDelta: 0.005,
    /** Hover settles after this many ms before the commentary changes (no flicker while sweeping). */
    hoverDelayMs: 120,
    /** Seats drawn in the chamber estimate (display only; the vote is one pass chance). */
    chamberSeats: 200,
  },

  draft: {
    handSize: 3,
    repeatCooldownQuarters: 4,
    /** [OPEN] what pays for rerolls: placeholder is Political Capital. */
    rerollCurrency: 'pc' as const,
    rerollBaseCost: 1,
    rerollCostFactor: 2,
  },

  pc: {
    start: 0,
    perQuarter: 2,
    supportBonusThreshold: 60,
    supportBonus: 1,
  },

  /** Leader abilities (phase 17): three per leader, each usable once per game (data/leaders.json). */
  abilities: {
    /** Game days per "month" of an ability (12 months = 360 days). */
    monthDays: 30,
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

  /**
   * "Living map" (presentation only, never affects the simulation): small pixel actors on the map that
   * read the game state. Spawn chances are per elapsed game day; lifetimes are real milliseconds.
   */
  life: {
    /** At most this many actors on the map at once (cows included). */
    maxActors: 3,
    maxActorsMobile: 3,
    /**
     * The next ambient actor waits until the last one (ambient or event) has finished, plus a random
     * real-time quiet gap (ms), so the map is regularly empty. Event actors (chaos, budget vote, regional
     * shifts) ignore the gap but not the cap.
     */
    ambientGapMs: { min: 3000, max: 8000 },
    /** Sprites are drawn this much larger on phones (the whole map is much smaller there). */
    mobileSpriteScale: 1.6,
    /** Ambient cows (1-2) wander into a rural kraj, graze and leave; they count toward maxActors. */
    cowRegions: ['CZ031', 'CZ063', 'CZ053', 'CZ064', 'CZ041', 'CZ052', 'CZ071', 'CZ032'] as string[],
    cowPerDay: 0.2,
    cowMs: 8000,
    /** Trucks: chance/day = truckPerDay * (truckBase + finances / 100). Under truckEmptyBelow they drive empty. */
    truckPerDay: 0.25,
    truckBase: 0.3,
    truckEmptyBelow: 20,
    /** Map units per real second. */
    truckSpeed: 90,
    limoSpeed: 110,
    /** A passed budget vote sends a convoy of this many trucks out of the capital. */
    convoy: 3,
    convoyStaggerMs: 700,
    capital: 'CZ010',
    /** Protest crowds where regional support is below crowdBelow (chance/day per region). */
    crowdBelow: 30,
    crowdPerDay: 0.05,
    /** Extra crowds (placards in the group's colour) for each group with anger >= anger.pulseAt. */
    angerCrowdPerDay: 0.06,
    crowdSize: { min: 3, max: 5 },
    crowdMs: 6000,
    /** Blackouts: on chaos events, and periodically while finances < blackoutBelow (or at the zero penalty). */
    blackoutBelow: 25,
    blackoutPerDay: 0.04,
    blackoutMs: 4200,
    /** Oligarch limo to the capital when oligarch anger drops by >= limoOnDrop, or ambient while anger < limoCalmBelow. */
    limoOnDrop: 2,
    limoCalmBelow: 30,
    limoPerDay: 0.015,
    /** Regional shift of at least this size shows a firework (gain) or a rain cloud (loss) over the kraj. */
    regionFxMin: 1,
    fireworkMs: 2400,
    rainMs: 4600,
    /** Anger meter shake / resource flash threshold (absolute change). */
    flashMinDelta: 1,
  },

  /** Trend charts (side panel, top-bar details). Trend points are weekly. */
  charts: {
    tickerWeeks: 26,
  },

  /** Phase 14: regional demands and pledges. */
  demands: {
    /** Demands spawned per game year (spawn days drawn at the year's first quarter from the `demands` stream). */
    perYear: 3,
    /** Spawn window inside the year (days from the year's start / before its end). */
    spawnFromDay: 10,
    spawnBeforeYearEnd: 30,
    /** At most this many open demand pins; at most one demand or pledge per region. */
    maxOpen: 2,
    /** Days a demand pin waits for an answer before it expires (counts as ignored). */
    responseDays: 30,
    /** Time to fulfil an accepted demand. */
    deadlineQuarters: 4,
    /** An ignored demand applies onReject x ignoreFactor. */
    ignoreFactor: 0.5,
    /** Draft / compromise-offer weight multiplier for cards that would fulfil an active pledge. */
    draftBoost: 2,
  },

  /** Regional events (regions workspace): a few a year in random kraje, whole-kraj animation + "!" pin. */
  regionEvents: {
    enabled: true,
    /** Events per game year, spread evenly over the year, each in a random kraj. P26: 3 -> 1 (stakeholder: fewer random kraj events, more player choice). */
    perYear: 1,
    /** Spawn window inside the year (days from the year's start / before its end). */
    spawnFromDay: 5,
    spawnBeforeYearEnd: 20,
    /** Days the event (and its animation) stays open before it counts as ignored. */
    responseDays: 30,
  },

  /**
   * Kraj actions (P26, regions workspace): the player picks where to work. Each kraj offers up to
   * `offered` actions (best by its traits, plus the `always` ones); one action per kraj per year and at most
   * `perQuarter` actions in a quarter.
   */
  regionActions: {
    enabled: true,
    offered: 3,
    perKrajPerYear: 1,
    perQuarter: 2,
  },

  /** Catastrophes and special agents (catastrophes workspace, core/specialCards.ts). */
  specials: {
    /** Special cards per game year (day and card drawn at the year's first quarter, `specials` stream). */
    perYear: 1,
    /** Chance that a drawn card is a special agent; otherwise it is a catastrophe. */
    agentChance: 0.5,
    /** Spawn window inside the year (days from the year's start / before its end). */
    spawnFromDay: 15,
    spawnBeforeYearEnd: 20,
    /** Minimum days between two special cards of the same year. */
    minGapDays: 20,
  },

  /** Event timeline in the top right (catastrophes workspace, core/timeline.ts). */
  timeline: {
    /** Visible span around today. */
    quartersBack: 1,
    quartersAhead: 3,
    /** Catastrophes, agents and chaos events show as '?' until this many days before they happen. */
    revealDays: 91,
    /** How long the "now revealed" notification stays (real seconds). */
    toastSeconds: 7,
  },

  /** Compromise mini-games (UI only; the core only sees the final score). */
  minigames: {
    countdownSec: 3,
    /** Result splash: score >= great -> "Skvele", >= ok -> "Ujde to", else "Prusvih". */
    tiers: { great: 0.7, ok: 0.4 },
    press: { durationMs: 12000, spawnMs: 650, fallMsStart: 3200, fallMsEnd: 2100, spinShare: 0.6, gaffePenalty: 2 },
    debate: { questions: 5, zoneStart: 0.26, zoneShrink: 0.035, edge: 0.07, periodMsStart: 1500, periodMsShrink: 130, timeoutMs: 3500, feedbackMs: 550 },
    tour: { durationMs: 12000, spawnMs: 520, lifeMsStart: 1000, lifeMsEnd: 650, handShare: 0.75, hitPenalty: 2 },
  },

  /** Headless bots: assumed mini-game score of the greedy bot (random draws uniform 0..1). */
  bots: {
    greedyMinigameScore: 0.75,
    /** Greedy bot's estimate of the chance to fulfil a pledge it accepts. */
    pledgeFulfilEstimate: 0.6,
    /** Kraj actions (P26): the greedy bot keeps this much Finance and prices each Finance point it spends. */
    regionActionFinanceReserve: 40,
    regionActionFinancePrice: 0.008,
    /** ...and each PC (PC also buys upgrades, which the bot otherwise undervalues). */
    regionActionPcPrice: 0.03,
  },

  /** Cheat codes for the pause menu's Podvody window: code (upper case) -> reward. */
  cheats: {
    codes: {
      PK1000: { pc: 1000 },
    } as Record<string, { pc: number }>,
  },

  /** Simulator targets on Normal (§13). */
  simulatorTargets: {
    randomMaxWinRate: 0.15,
    /** Daniel (P27): both leaders at least 33 % with the greedy bot on Normal; 55 % as a soft ceiling. */
    greedyMinWinRate: 0.33,
    greedyMaxWinRate: 0.55,
  },
};

export type Config = typeof config;
