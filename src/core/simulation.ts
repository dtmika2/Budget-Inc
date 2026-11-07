/**
 * The simulation core: pure, deterministic, headless. The UI owns real time only and calls tick();
 * every player decision goes through dispatch(input) and is recorded for replay (spec §10.2).
 */
import type { Config, DifficultyPreset } from '../config';
import { abilityOf, activateAbility, blamedBundle, canUseAbility, firePulse } from './abilities';
import { computeFinances, initPct } from './budget';
import {
  canRerollBudget,
  openBudgetVote,
  passChance,
  rerollBudget,
  scheduleBudgetVotes,
  validateVote,
  violations,
  voteBudget,
  voteBundle,
  zoneBundle,
  type Sliders,
} from './budgetVote';
import { canRespond, fireChaos, respond, scheduleChaosForPick } from './chaos';
import { canMakeCompromise, makeCompromise, openCompromise, scaleBundle, scheduleQuarterCompromise, soldBundle } from './compromise';
import {
  acceptDemand,
  canAnswerDemand,
  checkPledgeDeadlines,
  checkPledgesPolicy,
  expireDemand,
  pledgesForCard,
  rejectDemand,
  forRequester,
  resolveSelf,
  scheduleYearDemands,
  spawnDemand,
  templateOf,
} from './demands';
import { drawHand, rerollCost } from './draft';
import { applyBundle, applyDaily, previewBundle, type EffectHost, type PreviewRanges } from './effects';
import { electionNight, projection } from './election';
import { triggeredEnding } from './endings';
import { makeEntry } from './log';
import { applyGroupPressure } from './groupPressure';
import { canDoRegionAction, doRegionAction, regionActionBundle, regionActionTemplate } from './regionActions';
import { rollPrestigeBonus } from './prestigeBonus';
import { scalar, tickModifiers, type PipelineCtx } from './modifiers';
import { collectPin, expirePin, scheduleQuarterPins, spawnPin } from './opportunities';
import { applyStandInPenalties, applyZeroPenalties, updateZeroPenalties } from './penalties';
import {
  canAnswerRegionEvent,
  expireRegionEvent,
  ignoreRegionEvent,
  interveneRegionEvent,
  regionEventTemplate,
  scheduleYearRegionEvents,
  spawnRegionEvent,
} from './regionEvents';
import { createStreams, shortHash, type RngStreams } from './rng';
import { takeNextDue } from './scheduler';
import { computeScore } from './score';
import type {
  ChaosEventDef,
  CompromiseCard,
  ChangeSource,
  Deltas,
  DifficultyId,
  EffectBundle,
  EndingDef,
  GameData,
  GameState,
  GroupId,
  Requester,
  Input,
  LeaderDef,
  LeaderId,
  LogEntry,
  PolicyCard,
  Projection,
  ResourceId,
} from './types';
import { GROUP_IDS, RESOURCE_IDS } from './types';
import { cheatReward, normalizeCheat } from './cheats';
import { buyUpgrade, canBuy, canUseUpgradeAction, grantStartNodes, upgradeActionBundle, applyUpgradeAction } from './upgrades';
import { acceptSpecial, canAcceptSpecial, canCloseSpecial, closeSpecial, initialSpecials, openSpecial, scheduleYearSpecials } from './specialCards';

export interface SimOptions {
  seed: string;
  leader: LeaderId;
  difficulty: DifficultyId;
  appVersion?: string;
  /** Wall clock for log timestamps. Headless default returns 0 (excluded from replay comparison). */
  now?: () => number;
}

/**
 * Seeded start jitter of regional support: uniform +-jitter per kraj, re-centred so the seat-weighted
 * mean is 0 — the national average (and so the starting projection) is unchanged, only its spread.
 */
export function initialRegionShift(data: GameData, jitter: number, rng: RngStreams): Record<string, number> {
  const regions = data.regions.regions;
  const raw = regions.map(() => (jitter > 0 ? rng.regions.uniform(-jitter, jitter) : 0));
  const seats = regions.reduce((s, r) => s + r.seats, 0) || 1;
  const mean = regions.reduce((s, r, i) => s + r.seats * raw[i], 0) / seats;
  return Object.fromEntries(regions.map((r, i) => [r.code, raw[i] - mean]));
}

export type DispatchResult = { ok: true } | { ok: false; reason: string };

const TREND_KEEP = 120;

export class Simulation implements EffectHost {
  readonly data: GameData;
  readonly cfg: Config;
  readonly opts: SimOptions;
  readonly leaderDef: LeaderDef;
  readonly preset: DifficultyPreset;
  readonly rng: RngStreams;
  readonly cards: PolicyCard[];
  readonly cardById: Map<string, PolicyCard>;
  readonly compromises: CompromiseCard[];
  readonly compromiseById: Map<string, CompromiseCard>;
  readonly eventById: Map<string, ChaosEventDef>;
  state: GameState;

  private listeners = new Set<() => void>();
  private batchDepth = 0;
  private dirty = false;
  private now: () => number;

  constructor(data: GameData, cfg: Config, opts: SimOptions) {
    this.data = data;
    this.cfg = cfg;
    this.opts = opts;
    const leader = data.leaders.find((l) => l.id === opts.leader);
    if (!leader) throw new Error(`Unknown leader ${opts.leader}`);
    this.leaderDef = leader;
    this.preset = cfg.difficulty[opts.difficulty];
    this.rng = createStreams(opts.seed);
    this.now = opts.now ?? (() => 0);
    this.cards = data.policies.filter((c) => c.availableFor.includes(leader.id));
    this.cardById = new Map(data.policies.map((c) => [c.id, c]));
    this.compromises = data.compromises.filter((c) => c.availableFor.includes(leader.id));
    this.compromiseById = new Map(data.compromises.map((c) => [c.id, c]));
    this.eventById = new Map(data.events.map((e) => [e.id, e]));

    this.state = {
      runId: `run-${shortHash(opts.seed)}`,
      seed: opts.seed,
      leader: leader.id,
      difficulty: opts.difficulty,
      phase: 'running',
      quarter: 1,
      day: 1,
      tickCount: 0,
      resources: { ...leader.start },
      anger: { ...leader.startAnger },
      pc: cfg.pc.start,
      budget: initPct(data.budget),
      financesExtra: 0,
      financeModAccum: 0,
      regionShift: initialRegionShift(data, cfg.regions.startJitter, this.rng),
      modifiers: [],
      ongoing: [],
      zeroPenalties: { finances: false, support: false, prestige: false },
      draft: null,
      compromiseOffer: null,
      budgetVoteRedLines: null,
      budgetVoteRequests: null,
      budgetVoteItems: null,
      budgetVoteRerolls: 0,
      tourUsedInYear: null,
      regionHistory: [],
      demands: [],
      pledges: [],
      demandSeq: 0,
      regionEvents: [],
      regionEventSeq: 0,
      regionActionsDone: [],
      picked: [],
      schedule: [],
      scheduleSeq: 0,
      pins: [],
      pinSeq: 0,
      pendingResponses: [],
      eventSeq: 0,
      abilitiesUsed: [],
      blame: null,
      ownedUpgrades: [],
      upgradeReady: {},
      specials: initialSpecials(),
      projection: { S: 0, T: 0, P: 0, regionSupport: {} },
      trend: [],
      endingId: null,
      election: null,
      outcome: null,
      score: null,
      quartersCompleted: 0,
      log: [],
      inputs: [],
      version: 0,
    };
    grantStartNodes(this);
    this.recomputeFinances();
    this.state.projection = this.computeProjection();
    this.pushTrend();
    this.pushRegionHistory();

    this.log('run_started', {
      runId: this.state.runId,
      seed: opts.seed,
      leader: leader.id,
      difficulty: opts.difficulty,
      appVersion: opts.appVersion ?? 'dev',
      budgetSource: data.budget.source,
      dataFiles: data.fileHashes,
      regionShift: { ...this.state.regionShift },
    });
    this.log('leader_selected', { leader: leader.id });
    scheduleBudgetVotes(this);
    this.startQuarter(1);
  }

  // ------------------------------------------------------------ helpers

  get absDay(): number {
    return this.absDayOf(this.state.quarter, this.state.day);
  }

  absDayOf(quarter: number, day: number): number {
    return (quarter - 1) * this.cfg.time.daysPerQuarter + day;
  }

  get isOver(): boolean {
    const p = this.state.phase;
    return p === 'ending' || p === 'election' || p === 'finished';
  }

  /** ISO calendar date of an absolute game day (day 1 = startDate). */
  dateOf(absDay: number): string {
    const [y, m, d] = this.cfg.time.startDate.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + absDay - 1)).toISOString().slice(0, 10);
  }

  pipeline(): PipelineCtx {
    return { modifiers: this.state.modifiers, negativeMultiplier: this.preset.negativeMultiplier };
  }

  recomputeFinances(): void {
    const s = this.state;
    s.resources.finances = computeFinances(
      this.data.budget,
      s.budget,
      this.cfg.finances.scale,
      this.leaderDef.start.finances,
      s.financesExtra,
      s.financeModAccum,
    );
  }

  effectiveTBase(): number {
    return scalar(this.pipeline(), 'election.T_base', this.preset.T_base);
  }

  computeProjection(
    support = this.state.resources.support,
    anger: Record<GroupId, number> = this.state.anger,
    shifts: Record<string, number> = this.state.regionShift,
  ): Projection {
    return projection(this.cfg, this.data.regions, this.state.leader, support, anger, this.effectiveTBase(), shifts);
  }

  log(type: string, extra: Record<string, unknown> = {}, deltas?: Deltas): LogEntry {
    const entry = makeEntry(this.state, type, this.absDay, this.dateOf(this.absDay), this.now(), extra, deltas);
    this.state.log.push(entry);
    return entry;
  }

  /** Weekly snapshot of every region's support s_r (region screen history, phase 13). */
  private pushRegionHistory(): void {
    const s: Record<string, number> = {};
    for (const [code, v] of Object.entries(this.state.projection.regionSupport)) s[code] = Math.round(v * 100) / 100;
    this.state.regionHistory.push({ absDay: this.absDay, s, national: Math.round(this.state.resources.support * 100) / 100 });
  }

  private pushTrend(): void {
    const s = this.state;
    s.trend.push({ absDay: this.absDay, resources: { ...s.resources }, anger: { ...s.anger }, P: s.projection.P });
    if (s.trend.length > TREND_KEEP) s.trend.splice(0, s.trend.length - TREND_KEEP);
  }

  // ------------------------------------------------------------ subscription

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Run several ticks/dispatches and notify subscribers once. */
  batch(fn: () => void): void {
    this.batchDepth++;
    try {
      fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.dirty) this.notify();
    }
  }

  private changed(): void {
    this.state.version++;
    if (this.batchDepth > 0) this.dirty = true;
    else this.notify();
  }

  private notify(): void {
    this.dirty = false;
    for (const fn of this.listeners) fn();
  }

  // ------------------------------------------------------------ quarter flow

  private startQuarter(q: number): void {
    const s = this.state;
    s.quarter = q;
    s.day = 1;
    const base = Math.max(0, scalar(this.pipeline(), 'pc.perQuarter', this.cfg.pc.perQuarter));
    const bonus = s.resources.support >= this.cfg.pc.supportBonusThreshold ? this.cfg.pc.supportBonus : 0;
    const gain = Math.round(base + bonus);
    s.pc += gain;
    this.log('quarter_started', { pcGained: gain });
    scheduleQuarterPins(this);
    scheduleQuarterCompromise(this);
    scheduleYearDemands(this);
    scheduleYearRegionEvents(this);
    scheduleYearSpecials(this);
    s.draft = { hand: [], shownThisQuarter: [], rerolls: 0 };
    s.phase = 'draft';
    this.deal();
  }

  private deal(): void {
    const s = this.state;
    const d = s.draft!;
    const { hand, relaxLevel } = drawHand(
      {
        cards: this.cards,
        weights: this.leaderDef.leaningWeights,
        picked: s.picked,
        shownThisQuarter: d.shownThisQuarter,
        quarter: s.quarter,
        repeatCooldownQuarters: this.cfg.draft.repeatCooldownQuarters,
        handSize: this.cfg.draft.handSize,
        boost: s.pledges.length ? (c) => (pledgesForCard(this, c.id).length ? this.cfg.demands.draftBoost : 1) : undefined,
      },
      this.rng.draft,
    );
    d.hand = hand;
    for (const id of hand) if (!d.shownThisQuarter.includes(id)) d.shownThisQuarter.push(id);
    if (relaxLevel > 0) this.log('pool_relaxed', { level: relaxLevel });
    this.log('draft_shown', { cards: hand });
  }

  currentRerollCost(): number {
    const d = this.state.draft;
    return rerollCost(d?.rerolls ?? 0, this.cfg.draft.rerollBaseCost, this.cfg.draft.rerollCostFactor);
  }

  // ------------------------------------------------------------ tick

  /** Advance exactly one game day (plan §3.4). Does nothing unless phase === 'running'. */
  tick(): void {
    if (this.state.phase !== 'running') return;
    const s = this.state;
    s.tickCount++;
    const abs = this.absDay;

    // 1. scheduled entries for today: budget vote (stops the tick), chaos, pin spawns, pin expiries
    for (let e = takeNextDue(s, abs); e; e = takeNextDue(s, abs)) {
      if (e.kind === 'budgetVote') {
        openBudgetVote(this);
        this.changed();
        return;
      }
      if (e.kind === 'compromise') {
        if (openCompromise(this)) {
          this.changed();
          return;
        }
        continue;
      }
      if (e.kind === 'special') {
        if (openSpecial(this, e)) {
          this.changed();
          return;
        }
        continue;
      }
      if (e.kind === 'chaos') fireChaos(this, e);
      else if (e.kind === 'pinSpawn') spawnPin(this, e);
      else if (e.kind === 'pinExpire') expirePin(this, e);
      else if (e.kind === 'demandSpawn') spawnDemand(this);
      else if (e.kind === 'demandExpire') expireDemand(this, e);
      else if (e.kind === 'regionEventSpawn') spawnRegionEvent(this, e);
      else if (e.kind === 'regionEventExpire') expireRegionEvent(this, e);
      else if (e.kind === 'abilityPulse') firePulse(this, e);
    }

    // 2. daily changes: drift -> ongoing -> zero penalties (+ stand-ins) -> anger decay; then durations
    for (const res of RESOURCE_IDS) {
      const base = this.cfg.drift[res] * this.preset.driftMultiplier;
      if (base !== 0) applyDaily(this, res, base, 'drift');
    }
    for (const o of s.ongoing) applyDaily(this, o.target, o.perDay, 'ongoing');
    applyZeroPenalties(this);
    applyGroupPressure(this);
    applyStandInPenalties(this);
    checkPledgeDeadlines(this);
    const pull = this.cfg.anger.pullPerDay;
    if (pull > 0) {
      for (const g of GROUP_IDS) {
        const a = s.anger[g];
        if (a >= this.cfg.anger.max) continue;
        const diff = this.leaderDef.startAnger[g] - a;
        s.anger[g] = a + Math.sign(diff) * Math.min(Math.abs(diff), pull);
      }
    }
    rollPrestigeBonus(this);
    for (const o of s.ongoing) o.daysLeft -= 1;
    s.ongoing = s.ongoing.filter((o) => o.daysLeft > 0);
    s.modifiers = tickModifiers(s.modifiers);

    // 3. finances from the budget
    this.recomputeFinances();
    // 4. zero-penalty transitions
    updateZeroPenalties(this);
    // 5. endings, then snap election
    if (this.checkTerminal()) {
      this.changed();
      return;
    }
    // 6. weekly projection + trend
    if (abs % this.cfg.election.projectionEveryDays === 0) {
      s.projection = this.computeProjection();
      this.pushTrend();
      this.pushRegionHistory();
    }
    // 7. end of quarter
    if (s.day >= this.cfg.time.daysPerQuarter) {
      s.quartersCompleted = s.quarter;
      if (s.quarter < this.cfg.time.quarters) this.startQuarter(s.quarter + 1);
      else this.finishElection(false);
    } else {
      s.day += 1;
    }
    this.changed();
  }

  /** Built ending at its threshold wins over a snap election on the same day. */
  private checkTerminal(): boolean {
    if (this.isOver) return true;
    const ending = triggeredEnding(this.data.endings, this.state);
    if (ending) {
      this.finishEnding(ending);
      return true;
    }
    if (this.state.resources.coalition <= 1e-9) {
      this.finishElection(true);
      return true;
    }
    return false;
  }

  private cancelAll(reason: string): void {
    const s = this.state;
    for (const e of s.schedule) this.log('scheduled_cancelled', { what: e.kind, payload: e.payload, absDay: e.absDay, reason });
    for (const o of s.ongoing) this.log('scheduled_cancelled', { what: 'ongoing', key: o.key, daysLeft: o.daysLeft, reason });
    for (const p of s.pins) this.log('scheduled_cancelled', { what: 'pin', pinId: p.id, reason });
    for (const p of s.pendingResponses) this.log('scheduled_cancelled', { what: 'response', eventId: p.eventId, reason });
    for (const d of s.demands) this.log('scheduled_cancelled', { what: 'demand', demandId: d.id, reason });
    for (const p of s.pledges) this.log('scheduled_cancelled', { what: 'pledge', pledgeId: p.id, reason });
    for (const e of s.regionEvents) this.log('scheduled_cancelled', { what: 'region_event', eventId: e.id, reason });
    s.demands = [];
    s.pledges = [];
    s.regionEvents = [];
    s.schedule = [];
    s.ongoing = [];
    s.pins = [];
    s.pendingResponses = [];
    s.draft = null;
    s.compromiseOffer = null;
    s.budgetVoteRedLines = null;
    s.budgetVoteItems = null;
  }

  private finishElection(snap: boolean): void {
    const s = this.state;
    this.cancelAll(snap ? 'snap_election' : 'term_end');
    const proj = this.computeProjection();
    s.projection = proj;
    const result = electionNight(this.cfg, this.data.regions, proj, this.rng.election, snap);
    s.election = result;
    s.outcome = result.win ? 'win' : 'loss';
    s.phase = 'election';
    s.score = computeScore(this.cfg, result.win, proj.P, s.quartersCompleted, s.resources, s.anger);
    this.log('election', { ...result });
    this.log('run_finished', { outcome: s.outcome, score: s.score, quartersCompleted: s.quartersCompleted });
  }

  private finishEnding(ending: EndingDef): void {
    const s = this.state;
    this.cancelAll(`ending:${ending.id}`);
    const proj = this.computeProjection();
    s.projection = proj;
    s.endingId = ending.id;
    s.outcome = 'ending';
    s.phase = 'ending';
    s.score = computeScore(this.cfg, false, proj.P, s.quartersCompleted, s.resources, s.anger);
    this.log('ending', { endingId: ending.id, group: ending.group, P: proj.P });
    this.log('run_finished', { outcome: s.outcome, score: s.score, quartersCompleted: s.quartersCompleted });
  }

  // ------------------------------------------------------------ inputs

  /** Validate without applying. */
  validate(input: Input): string | null {
    const s = this.state;
    if (this.isOver) return 'run is over';
    switch (input.kind) {
      case 'cheat':
        return cheatReward(this.cfg, input.code) ? null : 'unknown cheat code';
      case 'pickPolicy':
        if (s.phase !== 'draft' || !s.draft) return 'no draft open';
        return s.draft.hand.includes(input.cardId) ? null : 'card not in hand';
      case 'reroll':
        if (s.phase !== 'draft' || !s.draft) return 'no draft open';
        return s.pc >= this.currentRerollCost() ? null : 'cannot afford reroll';
      case 'rerollBudget':
        return canRerollBudget(this);
      case 'respond':
        return canRespond(this, input.eventInstanceId, input.responseId, input.timedOut);
      case 'collectOpportunity':
        if (s.phase !== 'running') return 'not running';
        return s.pins.some((p) => p.id === input.pinId) ? null : 'no such pin';
      case 'makeCompromise':
        return canMakeCompromise(this, input.cardId, input.channelId, input.score);
      case 'voteBudget':
        if (s.phase !== 'budgetVote') return 'no vote open';
        return validateVote(this, input.sliders, input.presetId);
      case 'buyUpgrade':
        return canBuy(this, input.nodeId);
      case 'useUpgradeAction':
        return canUseUpgradeAction(this, input.nodeId, input.target);
      case 'useAbility':
        return canUseAbility(this, input.abilityId, input.target);
      case 'acceptDemand':
      case 'rejectDemand':
        return canAnswerDemand(this, input.demandId);
      case 'interveneRegionEvent':
      case 'ignoreRegionEvent':
        return canAnswerRegionEvent(this, input.eventId, input.kind === 'interveneRegionEvent');
      case 'regionAction':
        return canDoRegionAction(this, input.region, input.actionId);
      case 'acceptSpecial':
        return canAcceptSpecial(this);
      case 'closeSpecial':
        return canCloseSpecial(this);
    }
  }

  dispatch(input: Input): DispatchResult {
    const reason = this.validate(input);
    if (reason) return { ok: false, reason };
    const s = this.state;
    s.inputs.push({ tick: s.tickCount, quarter: s.quarter, day: s.day, input });
    switch (input.kind) {
      case 'cheat': {
        const { pc } = cheatReward(this.cfg, input.code)!;
        s.pc += pc;
        this.log('cheat_used', { code: normalizeCheat(input.code), pc }, { resources: {}, anger: {}, pc });
        break;
      }
      case 'makeCompromise':
        makeCompromise(this, input.cardId, input.channelId, input.score);
        break;
      case 'pickPolicy': {
        const card = this.cardById.get(input.cardId)!;
        const blame = blamedBundle(this, card);
        const { rolled, deltas } = applyBundle(this, blame.bundle, 'policy', `policy:${card.id}`, this.rng.effects);
        if (blame.blamed && s.blame) {
          s.blame.left -= 1;
          this.log('blame_shifted', { cardId: card.id, left: s.blame.left });
          if (s.blame.left <= 0) s.blame = null;
        }
        s.picked.push({ cardId: card.id, quarter: s.quarter });
        s.draft = null;
        s.phase = 'running';
        this.log('policy_picked', { cardId: card.id, leaning: card.leaning, rolled }, deltas);
        checkPledgesPolicy(this, card.id);
        scheduleChaosForPick(this, card);
        break;
      }
      case 'rerollBudget':
        rerollBudget(this);
        break;
      case 'reroll': {
        const cost = this.currentRerollCost();
        s.pc -= cost;
        s.draft!.rerolls += 1;
        this.log('reroll', { cost, currency: this.cfg.draft.rerollCurrency });
        this.deal();
        break;
      }
      case 'respond':
        respond(this, input.eventInstanceId, input.responseId, input.timedOut);
        break;
      case 'collectOpportunity':
        collectPin(this, input.pinId);
        break;
      case 'voteBudget':
        voteBudget(this, input.sliders, input.presetId);
        break;
      case 'buyUpgrade':
        buyUpgrade(this, input.nodeId);
        break;
      case 'useUpgradeAction':
        applyUpgradeAction(this, input.nodeId, input.target);
        break;
      case 'useAbility':
        activateAbility(this, input.abilityId, input.target);
        break;
      case 'acceptDemand':
        acceptDemand(this, input.demandId);
        break;
      case 'rejectDemand':
        rejectDemand(this, input.demandId);
        break;
      case 'regionAction':
        doRegionAction(this, input.region, input.actionId);
        break;
      case 'interveneRegionEvent':
        interveneRegionEvent(this, input.eventId);
        break;
      case 'ignoreRegionEvent':
        ignoreRegionEvent(this, input.eventId);
        break;
      case 'acceptSpecial':
        acceptSpecial(this);
        break;
      case 'closeSpecial':
        closeSpecial(this);
        break;
    }
    this.checkTerminal();
    this.changed();
    return { ok: true };
  }

  // ------------------------------------------------------------ previews (ranges after modifiers)

  preview(bundle: EffectBundle, source: ChangeSource): PreviewRanges {
    return previewBundle(this, bundle, source);
  }

  /** Preview a policy card or a regional compromise card. */
  previewCard(cardId: string): PreviewRanges {
    const comp = this.compromiseById.get(cardId);
    if (comp) return this.preview(comp, 'compromise');
    return this.preview(blamedBundle(this, this.cardById.get(cardId)!).bundle, 'policy');
  }

  /** Preview of a compromise sold through a channel with a given mini-game score. */
  previewCompromise(cardId: string, channelId: string, score: number): PreviewRanges {
    return this.preview(soldBundle(this, cardId, channelId, score), 'compromise');
  }

  previewResponse(eventId: string, responseId: string): PreviewRanges {
    const opt = this.eventById.get(eventId)?.responses?.options.find((o) => o.id === responseId);
    return this.preview(opt ?? {}, 'response');
  }

  /** Preview of a budget-vote slider setting: ranges, pass chance and crossed red lines. */
  previewVote(sliders: Sliders, presetId: string | null): PreviewRanges & { passChance: number; violations: string[] } {
    return {
      ...this.preview(voteBundle(this, sliders, presetId), 'budget_vote'),
      passChance: passChance(this, sliders, presetId),
      violations: violations(this, sliders).map((r) => r.item),
    };
  }

  /** Ranges of a demand's four outcomes in its region. */
  previewDemand(templateId: string, region: string, requester?: Requester): Record<'accept' | 'fulfil' | 'fail' | 'reject' | 'ignore', PreviewRanges> {
    const tpl = templateOf(this, templateId);
    const f = this.cfg.demands.ignoreFactor;
    const p = (b: EffectBundle) => this.preview(forRequester(this, resolveSelf(b, region), requester), 'demand');
    return {
      accept: p(tpl.onAccept),
      fulfil: p(tpl.onFulfil),
      fail: p(tpl.onFail),
      reject: p(tpl.onReject),
      ignore: p(scaleBundle(tpl.onReject, f, f)),
    };
  }

  /** Ranges of a budget category's cut and overspend zones (the advisors' hints). */
  previewBudgetZones(itemId: string): Record<'cut' | 'overspend', PreviewRanges & { pass: number }> {
    const it = this.data.budgetItems.find((i) => i.id === itemId)!;
    const z = (zone: typeof it.onCut) => ({ ...this.preview(zoneBundle(this, zone), 'budget_vote'), pass: zone.pass ?? 0 });
    return { cut: z(it.onCut), overspend: z(it.onOverspend) };
  }

  /** Ranges of an active skill-tree ability on a target (P29). */
  previewUpgradeAction(nodeId: string, target?: string): PreviewRanges {
    return this.preview(upgradeActionBundle(this, nodeId, target), 'ability');
  }

  /** Ranges of a kraj action in that kraj (P26). */
  previewRegionAction(actionId: string, region: string): PreviewRanges {
    return this.preview(regionActionBundle(regionActionTemplate(this, actionId)!, region), 'region_action');
  }

  /** Ranges of a region event's two outcomes in its kraj. */
  previewRegionEvent(templateId: string, region: string): Record<'intervene' | 'ignore', PreviewRanges> {
    const tpl = regionEventTemplate(this, templateId);
    const p = (b: EffectBundle) => this.preview(resolveSelf(b, region), 'region_event');
    return { intervene: p(tpl.onIntervene), ignore: p(tpl.onIgnore) };
  }

  /** Random stream of the demand system. */
  demandRng() {
    return this.rng.demands;
  }

  /** Instant effect of an ability (STB adds halving the chosen group's anger). */
  previewAbility(abilityId: string, target?: string): PreviewRanges {
    const a = abilityOf(this, abilityId)!;
    const p = this.preview(a.bundle, 'ability');
    if (a.action === 'halveAnger' && target && target in this.state.anger) {
      const g = target as GroupId;
      const cut = -this.state.anger[g] / 2;
      const r = p.anger[g];
      p.anger[g] = { min: (r?.min ?? 0) + cut, max: (r?.max ?? 0) + cut };
    }
    return p;
  }

  // ------------------------------------------------------------ misc for UI / bots

  resourceIds(): readonly ResourceId[] {
    return RESOURCE_IDS;
  }
}
