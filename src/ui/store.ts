/**
 * UI store: owns the Simulation for the current run plus presentation state (screen, speed, modals,
 * pop-ups, floating numbers, tutorial). React reads it through useStore(selector) — a
 * useSyncExternalStore bridge with shallow-equal caching, so components re-render only when their slice
 * changes. No game rules live here: every decision goes through sim.dispatch().
 */
import { useRef, useSyncExternalStore } from 'react';
import { config } from '@/config';
import type { LoadResult } from '@data/loader';
import { Simulation } from '@core/simulation';
import type { Deltas, DifficultyId, GameData, GroupId, Input, LeaderId, LogEntry, ResourceId } from '@core/types';
import { GROUP_IDS } from '@core/types';
import { Rng } from '@core/rng';
import { t } from '@i18n/index';
import { Clock } from './clock';
import { planLife, type ActorSpawn } from '@/regions/lifeDirector';
import { REGION_PATHS } from '@/regions/regionsPath';
import { usedCheats } from '@core/cheats';
import { loadSettings, recordScore, saveSettings, setTutorialSeen, tutorialSeen, type Settings } from './persist';

export type Screen = 'menu' | 'howto' | 'settings' | 'select' | 'game' | 'final' | 'dataError';
export type Modal = null | 'upgrades' | 'pause' | 'cheats' | 'settings' | 'confirmRestart' | 'confirmMenu' | 'ability';
export type TutorialStep = 'draft' | 'topbar' | 'map' | 'panel' | 'pin' | 'upgrades';
export const TUTORIAL_STEPS: TutorialStep[] = ['draft', 'topbar', 'map', 'panel', 'pin', 'upgrades'];

export interface Popup {
  id: number;
  kind: 'news' | 'response';
  titleKey: string;
  textKey?: string;
  params?: Record<string, string | number>;
  /** Params whose values are locale keys to translate first. */
  keyParams?: Record<string, string>;
  tone: 'bad' | 'good' | 'neutral';
  deltas?: Deltas;
  /** Where a click on the pop-up takes the player (phase 20). */
  target?: PopupTarget;
  instanceId?: string;
  eventId?: string;
  /** Remaining real milliseconds (news: auto-dismiss; response: countdown). */
  remainingMs: number;
  totalMs: number;
}

/** A place in the HUD a pop-up (or anything else) can take the player to. */
export type PopupTarget =
  | { kind: 'region'; code: string; tab: RegionTab }
  | { kind: 'resource'; id: ResourceId | 'projection' }
  | { kind: 'panel'; tab: PanelTab };

export type PanelTab = 'trend' | 'effects' | 'history';

/** Where a log entry belongs: its kraj, else the resource it moved most, else the interest groups, else history. */
export function targetOf(e: LogEntry): PopupTarget {
  if (typeof e.region === 'string' && e.region) {
    const open = e.type === 'region_event_spawned' || e.type === 'demand_spawned';
    return { kind: 'region', code: e.region, tab: open ? 'events' : 'main' };
  }
  const res = Object.entries(e.deltas?.resources ?? {}).sort((a, b) => Math.abs(b[1] ?? 0) - Math.abs(a[1] ?? 0))[0];
  if (res && Math.abs(res[1] ?? 0) >= 0.05) return { kind: 'resource', id: res[0] as ResourceId };
  if (Object.keys(e.deltas?.anger ?? {}).length) return { kind: 'panel', tab: 'trend' };
  return { kind: 'panel', tab: 'history' };
}

export interface Floater {
  id: number;
  /** `res.support` or `anger.media` */
  key: string;
  value: number;
  born: number;
}

/** A living-map actor on screen (presentation only). */
export interface Actor extends ActorSpawn {
  id: number;
  /** Map time (store.mapClock) at spawn. */
  born: number;
}

const REGION_CODES = REGION_PATHS.map((r) => r.code);
const LABELS = new Map(REGION_PATHS.map((r) => [r.code, r]));
function regionDistance(a: string, b: string): number {
  const p = LABELS.get(a);
  const q = LABELS.get(b);
  return p && q ? Math.hypot(p.labelX - q.labelX, p.labelY - q.labelY) : 0;
}

export interface UiState {
  screen: Screen;
  speed: number;
  userPaused: boolean;
  blurred: boolean;
  modal: Modal;
  drawerOpen: boolean;
  popups: Popup[];
  floaters: Floater[];
  /** Living-map actors (trucks, crowds, blackouts, ...). */
  actors: Actor[];
  tutorial: TutorialStep | null;
  /** Pending tutorial steps still to show this run. */
  tutorialQueue: TutorialStep[];
  settings: Settings;
  selectedRegion: string | null;
  /** Open tab of the region screen (regions workspace). */
  regionTab: RegionTab;
  /** Resource (or projection) whose top-bar detail is open. */
  resourceDetail: ResourceId | 'projection' | null;
  /** Open tab of the side panel. */
  panelTab: PanelTab;
  /** Ability whose target picker is open (modal 'ability'). */
  abilityPick: string | null;
  setup: { leader: LeaderId; difficulty: DifficultyId };
  newBest: boolean;
  electionRevealed: boolean;
  isMobile: boolean;
}

export type RegionTab = 'main' | 'actions' | 'events' | 'data';

type Listener = () => void;

const SPEEDS = config.time.speeds;

export class Store {
  readonly load: LoadResult;
  data: GameData | null;
  sim: Simulation | null = null;
  ui: UiState;
  /** Bumped on every change; snapshot key for subscribers. */
  version = 0;

  private listeners = new Set<Listener>();
  private unsubSim: (() => void) | null = null;
  private logCursor = 0;
  private popupSeq = 0;
  private floaterSeq = 0;
  private actorSeq = 0;
  /** Presentation-only RNG for the living map (never one of the simulation's streams). */
  private lifeRng: Rng | null = null;
  private lifeDay = 0;
  /** Map time (ms) after which the next ambient actor may appear. */
  private nextAmbientAt = 0;
  /**
   * Map time (ms): runs at the game speed while the clock runs, at 1x otherwise. The living map's actors
   * are timed on it, and MapTempo plays the map's animations at the same rate.
   */
  private mapClock = 0;
  private angerArmed: Record<GroupId, boolean> = { oligarchs: true, pensioners: true, media: true, eu: true, activists: true };
  readonly clock: Clock;

  constructor(load: LoadResult) {
    this.load = load;
    this.data = load.ok ? load.data : null;
    const settings = loadSettings(config.time.defaultSpeed);
    this.ui = {
      screen: load.ok ? 'menu' : 'dataError',
      speed: settings.defaultSpeed,
      userPaused: false,
      blurred: false,
      modal: null,
      drawerOpen: false,
      popups: [],
      floaters: [],
      actors: [],
      tutorial: null,
      tutorialQueue: [],
      settings,
      selectedRegion: null,
      regionTab: 'main',
      resourceDetail: null,
      panelTab: 'trend',
      abilityPick: null,
      setup: { leader: this.data?.leaders[0]?.id ?? 'mupka', difficulty: config.defaultDifficulty },
      newBest: false,
      electionRevealed: false,
      isMobile: typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches,
    };
    this.clock = new Clock(this);
    if (load.ok && load.warnings.length) console.warn('[data] warnings:', load.warnings);
  }

  // ------------------------------------------------------------ subscription

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  emit(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  setUi(patch: Partial<UiState>): void {
    this.ui = { ...this.ui, ...patch };
    this.emit();
  }

  // ------------------------------------------------------------ navigation

  go(screen: Screen): void {
    if (screen !== 'game') this.clock.stop();
    this.setUi({ screen, modal: null, drawerOpen: false });
  }

  startRun(leader: LeaderId = this.ui.setup.leader, difficulty: DifficultyId = this.ui.setup.difficulty): void {
    if (!this.data) return;
    this.unsubSim?.();
    const seed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    this.sim = new Simulation(this.data, config, {
      seed,
      leader,
      difficulty,
      appVersion: __APP_VERSION__,
      now: () => Date.now(),
    });
    this.logCursor = 0;
    this.lifeRng = new Rng(`${seed}|life`);
    this.lifeDay = this.sim.absDay;
    this.nextAmbientAt = 0;
    this.angerArmed = { oligarchs: true, pensioners: true, media: true, eu: true, activists: true };
    this.unsubSim = this.sim.subscribe(() => this.onSimChange());
    const tut = !tutorialSeen();
    this.ui = {
      ...this.ui,
      screen: 'game',
      setup: { leader, difficulty },
      speed: this.ui.settings.defaultSpeed,
      userPaused: false,
      modal: null,
      drawerOpen: false,
      popups: [],
      floaters: [],
      actors: [],
      tutorialQueue: tut ? [...TUTORIAL_STEPS] : [],
      tutorial: null,
      selectedRegion: null,
      regionTab: 'main',
      resourceDetail: null,
      panelTab: 'trend',
      abilityPick: null,
      newBest: false,
      electionRevealed: false,
    };
    this.onSimChange();
    this.clock.start();
  }

  // ------------------------------------------------------------ decisions

  dispatch(input: Input): boolean {
    if (!this.sim) return false;
    const r = this.sim.dispatch(input);
    if (!r.ok) console.warn('[sim] rejected', input, r.reason);
    return r.ok;
  }

  /** The run is over and its presentation (ending card / election night) has finished. */
  finishPresentation(): void {
    const s = this.sim?.state;
    if (s && s.score !== null && !usedCheats(s)) this.ui.newBest = recordScore(s.leader, s.difficulty, s.score);
    this.go('final');
  }

  // ------------------------------------------------------------ clock-facing state

  /** How fast map animations play: the game speed while the game runs, 1 when it is paused. */
  get mapTempo(): number {
    return !this.sim || this.effectivePaused ? 1 : this.ui.speed;
  }

  get effectivePaused(): boolean {
    const u = this.ui;
    return u.userPaused || u.blurred || u.modal !== null || u.tutorial !== null || u.selectedRegion !== null || this.sim?.state.phase !== 'running';
  }

  setSpeed(speed: number): void {
    if (!SPEEDS.includes(speed)) return;
    this.setUi({ speed, userPaused: false });
  }

  togglePause(): void {
    this.setUi({ userPaused: !this.ui.userPaused });
  }

  openModal(modal: Modal): void {
    this.setUi({ modal });
  }

  setSettings(patch: Partial<Settings>): void {
    const settings = { ...this.ui.settings, ...patch };
    saveSettings(settings);
    this.setUi({ settings });
  }

  resetTutorial(): void {
    setTutorialSeen(false);
  }

  // ------------------------------------------------------------ tutorial

  /** Show the next queued step if its trigger condition holds. */
  private advanceTutorial(): void {
    const u = this.ui;
    const sim = this.sim;
    if (!sim || u.tutorial || u.tutorialQueue.length === 0 || sim.isOver) return;
    const next = u.tutorialQueue[0];
    const ok =
      next === 'draft'
        ? sim.state.phase === 'draft'
        : next === 'pin'
          ? sim.state.phase === 'running' && sim.state.pins.length > 0
          : sim.state.phase === 'running';
    if (ok) this.ui = { ...u, tutorial: next, tutorialQueue: u.tutorialQueue.slice(1) };
  }

  tutorialNext(): void {
    this.ui = { ...this.ui, tutorial: null };
    if (this.ui.tutorialQueue.length === 0) setTutorialSeen(true);
    this.advanceTutorial();
    this.emit();
  }

  tutorialSkip(): void {
    setTutorialSeen(true);
    this.setUi({ tutorial: null, tutorialQueue: [] });
  }

  // ------------------------------------------------------------ sim -> presentation

  private onSimChange(): void {
    const sim = this.sim;
    if (!sim) return;
    const log = sim.state.log;
    const newEntries = log.slice(this.logCursor);
    this.logCursor = log.length;
    let popups = this.ui.popups;
    let floaters = this.ui.floaters;
    const now = performance.now();
    let entry: LogEntry | null = null;
    const add = (p: Omit<Popup, 'id' | 'remainingMs' | 'totalMs'>) => {
      const ms = (p.kind === 'response' ? config.popups.responseTimeoutSec : config.popups.popupSeconds) * 1000;
      const target = p.target ?? (entry ? targetOf(entry) : undefined);
      popups = [...popups, { ...p, target, id: ++this.popupSeq, remainingMs: ms, totalMs: ms }];
    };
    for (const e of newEntries) {
      if (e.deltas && !this.ui.settings.reducedMotion) floaters = [...floaters, ...this.floatersFor(e.deltas, now)];
      entry = e;
      this.popupFor(e, add);
    }
    entry = null;
    // anger warnings: once per crossing of warnAt, re-armed below rearmBelow
    for (const g of GROUP_IDS) {
      const a = sim.state.anger[g];
      if (this.angerArmed[g] && a >= config.anger.warnAt) {
        this.angerArmed[g] = false;
        add({ kind: 'news', titleKey: 'popup.chaos', textKey: 'popup.angerWarning', keyParams: { group: `group.${g}` }, params: { v: Math.round(a) }, tone: 'bad' });
      } else if (!this.angerArmed[g] && a < config.anger.rearmBelow) this.angerArmed[g] = true;
    }
    // drop response pop-ups whose event is no longer pending (cancelled at run end)
    const pending = new Set(sim.state.pendingResponses.map((p) => p.instanceId));
    popups = popups.filter((p) => p.kind !== 'response' || pending.has(p.instanceId!));
    const actors = this.planActors(newEntries, this.mapClock);
    this.ui = { ...this.ui, popups, floaters: floaters.slice(-40), actors };
    this.advanceTutorial();
    this.emit();
  }

  /** Living map: spawn actors for new log entries and elapsed game days. */
  private planActors(entries: readonly LogEntry[], now: number): Actor[] {
    const sim = this.sim!;
    const days = Math.max(0, sim.absDay - this.lifeDay);
    this.lifeDay = sim.absDay;
    const actors = this.ui.actors;
    if (!this.lifeRng || this.ui.settings.reducedMotion || sim.isOver) return actors;
    const s = sim.state;
    const spawns = planLife(
      {
        resources: s.resources,
        anger: s.anger,
        regionSupport: s.projection.regionSupport,
        zeroFinances: s.zeroPenalties.finances,
        entries,
        days: s.phase === 'running' ? days : 0,
        ambient: now >= this.nextAmbientAt,
        active: actors,
        regions: REGION_CODES,
        distance: regionDistance,
        maxActors: this.ui.isMobile ? config.life.maxActorsMobile : config.life.maxActors,
      },
      this.lifeRng,
      config.life,
      config.anger.pulseAt,
    );
    if (!spawns.length) return actors;
    // the next ambient actor waits until every new actor (ambient or event) has finished, plus a quiet gap
    const end = Math.max(...spawns.map((a) => now + a.delayMs + a.ttlMs));
    this.nextAmbientAt = Math.max(this.nextAmbientAt, end + this.lifeRng.uniform(config.life.ambientGapMs.min, config.life.ambientGapMs.max));
    return [...actors, ...spawns.map((a) => ({ ...a, id: ++this.actorSeq, born: now }))];
  }

  private floatersFor(d: Deltas, now: number): Floater[] {
    const out: Floater[] = [];
    for (const [k, v] of Object.entries(d.resources)) if (v && Math.abs(v) >= 0.05) out.push({ id: ++this.floaterSeq, key: `res.${k}`, value: v, born: now });
    for (const [k, v] of Object.entries(d.anger)) if (v && Math.abs(v) >= 0.05) out.push({ id: ++this.floaterSeq, key: `anger.${k}`, value: v, born: now });
    for (const [k, v] of Object.entries(d.regions ?? {})) if (v && Math.abs(v) >= 0.05) out.push({ id: ++this.floaterSeq, key: `region.${k}`, value: v, born: now });
    return out;
  }

  private popupFor(e: LogEntry, add: (p: Omit<Popup, 'id' | 'remainingMs' | 'totalMs'>) => void): void {
    const sim = this.sim!;
    switch (e.type) {
      case 'chaos_fired': {
        const ev = sim.eventById.get(String(e.eventId));
        if (!ev) return;
        add({
          kind: e.respondable ? 'response' : 'news',
          titleKey: 'popup.chaos',
          textKey: ev.text,
          tone: 'bad',
          deltas: e.deltas,
          instanceId: String(e.instanceId),
          eventId: ev.id,
        });
        return;
      }
      case 'budget_vote': {
        const opt = sim.data.budgetVote.find((o) => o.id === e.presetId);
        add(
          e.passed
            ? { kind: 'news', titleKey: 'budgetVote.title', textKey: 'popup.budgetPassed', keyParams: { name: opt?.label ?? 'budgetVote.custom' }, tone: 'good', deltas: e.deltas }
            : { kind: 'news', titleKey: 'budgetVote.title', textKey: 'popup.budgetFailed', tone: 'bad', deltas: e.deltas },
        );
        return;
      }
      case 'mandatory_growth':
        add({ kind: 'news', titleKey: 'budgetVote.title', textKey: 'popup.mandatoryGrowth', params: { pct: config.budgetVote.mandatoryGrowthPct }, tone: 'neutral', deltas: e.deltas });
        return;
      case 'ability_pulse': {
        const a = sim.leaderDef.abilities.find((x) => x.id === e.abilityId);
        if (a?.pulses) add({ kind: 'news', titleKey: a.name, textKey: a.pulses.label, params: { n: Number(e.n), of: Number(e.of) }, tone: 'good', deltas: e.deltas });
        return;
      }
      case 'event_condemned':
        add({ kind: 'news', titleKey: 'history.condemned', textKey: `ability.pick.${e.kind}`, tone: 'good' });
        return;
      case 'region_event_spawned': {
        const tpl = sim.data.regionEvents.find((x) => x.id === e.templateId);
        if (tpl) add({ kind: 'news', titleKey: tpl.title, textKey: 'popup.regionEvent', keyParams: { region: `region.${e.region}` }, tone: 'bad' });
        return;
      }
      case 'demand_spawned':
        add({
          kind: 'news',
          titleKey: 'popup.demand',
          textKey: 'popup.demandText',
          keyParams: { region: `region.${e.region}` },
          params: { who: demandWho(sim, e.requester as { type: string; id: string }) },
          tone: 'neutral',
        });
        return;
      case 'pledge_fulfilled':
      case 'pledge_failed':
      case 'demand_ignored': {
        const tpl = sim.data.demands.find((d) => d.id === e.templateId);
        const title = e.type === 'pledge_fulfilled' ? 'popup.pledgeFulfilled' : e.type === 'pledge_failed' ? 'popup.pledgeFailed' : 'popup.demandIgnored';
        add({ kind: 'news', titleKey: title, textKey: tpl?.text, tone: e.type === 'pledge_fulfilled' ? 'good' : 'bad', deltas: e.deltas });
        return;
      }
      case 'opportunity_collected': {
        const opp = sim.data.opportunities.find((o) => o.id === e.opportunityId);
        add({ kind: 'news', titleKey: 'popup.opportunity', textKey: opp?.text, tone: 'good', deltas: e.deltas });
        return;
      }
      case 'prestige_bonus':
        add({
          kind: 'news',
          titleKey: 'prestigeBonus.title',
          textKey: `prestigeBonus.${e.kind}`,
          keyParams: e.group ? { group: `group.${e.group}` } : undefined,
          tone: 'good',
          deltas: e.deltas,
        });
        return;
      case 'region_action': {
        const a = sim.data.regionActions.find((x) => x.id === e.actionId);
        if (a) add({ kind: 'news', titleKey: a.title, textKey: 'regionAction.done', keyParams: { region: `region.${e.region}` }, tone: 'good', deltas: e.deltas });
        return;
      }
      case 'upgrade_action': {
        const node = sim.data.upgrades.flatMap((tr) => tr.nodes).find((n) => n.id === e.nodeId);
        if (node) add({ kind: 'news', titleKey: node.name, textKey: 'upgrades.usedNews', tone: 'good', deltas: e.deltas });
        return;
      }
      case 'blame_shifted':
        add({ kind: 'news', titleKey: 'ability.stb.name', textKey: 'blame.shifted', params: { left: Number(e.left) }, tone: 'good' });
        return;
      case 'zero_penalty_started':
        add({ kind: 'news', titleKey: `penalty.${e.resource}`, textKey: 'popup.zeroStarted', keyParams: { name: `resource.${e.resource}` }, tone: 'bad' });
        return;
      case 'zero_penalty_ended':
        add({ kind: 'news', titleKey: `penalty.${e.resource}`, textKey: 'popup.zeroEnded', keyParams: { name: `penalty.${e.resource}` }, tone: 'good' });
        return;
      default:
        return;
    }
  }

  // ------------------------------------------------------------ per-frame (called by the clock)

  /** Advance real-time pop-up timers; returns true if something changed. */
  frame(dtMs: number, runningUnpaused: boolean): boolean {
    let changed = false;
    this.mapClock += dtMs * (runningUnpaused ? this.ui.speed : 1);
    const max = this.ui.isMobile ? config.popups.maxVisibleMobile : config.popups.maxVisibleDesktop;
    const visible = new Set(visiblePopups(this.ui.popups, max).map((p) => p.id));
    const timedOut: Popup[] = [];
    const popups: Popup[] = [];
    for (const p of this.ui.popups) {
      if (!visible.has(p.id)) {
        popups.push(p);
        continue;
      }
      const tickDown = p.kind === 'news' || runningUnpaused;
      if (!tickDown) {
        popups.push(p);
        continue;
      }
      const remainingMs = p.remainingMs - dtMs;
      changed = true;
      if (remainingMs > 0) popups.push({ ...p, remainingMs });
      else if (p.kind === 'response') timedOut.push(p);
    }
    const now = performance.now();
    const floaters = this.ui.floaters.filter((f) => now - f.born < 1400);
    if (floaters.length !== this.ui.floaters.length) changed = true;
    const actors = this.ui.actors.filter((a) => this.mapClock - a.born < a.delayMs + a.ttlMs);
    if (actors.length !== this.ui.actors.length) changed = true;
    if (changed) this.ui = { ...this.ui, popups, floaters, actors };
    for (const p of timedOut) {
      const ev = this.sim?.eventById.get(p.eventId!);
      this.ui = { ...this.ui, popups: this.ui.popups.filter((x) => x.id !== p.id) };
      this.dispatch({ kind: 'respond', eventInstanceId: p.instanceId!, responseId: ev?.responses?.default ?? '', timedOut: true });
    }
    return changed || timedOut.length > 0;
  }

  /** Take the player to a place in the HUD (a pop-up's target, a history row, ...). */
  goTo(target: PopupTarget): void {
    if (target.kind === 'region') this.setUi({ selectedRegion: target.code, regionTab: target.tab, resourceDetail: null });
    else if (target.kind === 'resource') this.setUi({ resourceDetail: target.id, selectedRegion: null });
    else this.setUi({ panelTab: target.tab, drawerOpen: this.ui.isMobile, resourceDetail: null });
  }

  /** A click on a news pop-up: go to its target and close it. */
  openPopup(id: number): void {
    const p = this.ui.popups.find((x) => x.id === id);
    this.dismissPopup(id);
    if (p?.target) this.goTo(p.target);
  }

  dismissPopup(id: number): void {
    this.setUi({ popups: this.ui.popups.filter((p) => p.id !== id) });
  }

  respond(popupId: number, responseId: string): void {
    const p = this.ui.popups.find((x) => x.id === popupId);
    if (!p?.instanceId) return;
    if (this.dispatch({ kind: 'respond', eventInstanceId: p.instanceId, responseId, timedOut: false })) this.dismissPopup(popupId);
  }
}

/** Respondable pop-ups first (never pushed out by news), then news, oldest first. */
export function visiblePopups(popups: readonly Popup[], max: number): Popup[] {
  const resp = popups.filter((p) => p.kind === 'response');
  const news = popups.filter((p) => p.kind === 'news');
  return [...resp, ...news].slice(0, Math.max(max, Math.min(resp.length, max)));
}

// ------------------------------------------------------------ React bridge

let store: Store | null = null;
export function initStore(load: LoadResult): Store {
  store = new Store(load);
  return store;
}
/** Requester name for pop-ups (party label or interest group). */
function demandWho(sim: Simulation, r: { type: string; id: string }): string {
  if (r.type === 'interestGroup') return t(`group.${r.id}`);
  const party = sim.data.parties.find((p) => p.id === r.id);
  return t('demand.party', { name: party ? t(party.label) : r.id });
}

export function getStore(): Store {
  if (!store) throw new Error('store not initialised');
  return store;
}

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

/** Subscribe to a slice of the store; re-renders only when the slice changes (shallow). */
export function useStore<T>(selector: (s: Store) => T, eq: (a: T, b: T) => boolean = shallowEqual): T {
  const s = getStore();
  const cache = useRef<{ v: T } | null>(null);
  const get = () => {
    const v = selector(s);
    if (cache.current && eq(cache.current.v, v)) return cache.current.v;
    cache.current = { v };
    return v;
  };
  return useSyncExternalStore(s.subscribe, get, get);
}
