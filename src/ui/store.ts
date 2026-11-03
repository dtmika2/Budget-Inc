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
import type { Deltas, DifficultyId, GameData, GroupId, Input, LeaderId, LogEntry } from '@core/types';
import { GROUP_IDS } from '@core/types';
import { Clock } from './clock';
import { loadSettings, recordScore, saveSettings, setTutorialSeen, tutorialSeen, type Settings } from './persist';

export type Screen = 'menu' | 'howto' | 'settings' | 'select' | 'game' | 'final' | 'dataError';
export type Modal = null | 'upgrades' | 'pause' | 'settings' | 'confirmRestart' | 'confirmMenu';
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
  instanceId?: string;
  eventId?: string;
  /** Remaining real milliseconds (news: auto-dismiss; response: countdown). */
  remainingMs: number;
  totalMs: number;
}

export interface Floater {
  id: number;
  /** `res.support` or `anger.media` */
  key: string;
  value: number;
  born: number;
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
  tutorial: TutorialStep | null;
  /** Pending tutorial steps still to show this run. */
  tutorialQueue: TutorialStep[];
  settings: Settings;
  selectedRegion: string | null;
  setup: { leader: LeaderId; difficulty: DifficultyId };
  newBest: boolean;
  electionRevealed: boolean;
  isMobile: boolean;
}

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
      tutorial: null,
      tutorialQueue: [],
      settings,
      selectedRegion: null,
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
      tutorialQueue: tut ? [...TUTORIAL_STEPS] : [],
      tutorial: null,
      selectedRegion: null,
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
    if (s && s.score !== null) this.ui.newBest = recordScore(s.leader, s.difficulty, s.score);
    this.go('final');
  }

  // ------------------------------------------------------------ clock-facing state

  get effectivePaused(): boolean {
    const u = this.ui;
    return u.userPaused || u.blurred || u.modal !== null || u.tutorial !== null || this.sim?.state.phase !== 'running';
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
    const add = (p: Omit<Popup, 'id' | 'remainingMs' | 'totalMs'>) => {
      const ms = (p.kind === 'response' ? config.popups.responseTimeoutSec : config.popups.popupSeconds) * 1000;
      popups = [...popups, { ...p, id: ++this.popupSeq, remainingMs: ms, totalMs: ms }];
    };
    for (const e of newEntries) {
      if (e.deltas && !this.ui.settings.reducedMotion) floaters = [...floaters, ...this.floatersFor(e.deltas, now)];
      this.popupFor(e, add);
    }
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
    this.ui = { ...this.ui, popups, floaters: floaters.slice(-40) };
    this.advanceTutorial();
    this.emit();
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
        const opt = sim.data.budgetVote.find((o) => o.id === e.optionId);
        add(
          e.passed
            ? { kind: 'news', titleKey: 'budgetVote.title', textKey: 'popup.budgetPassed', keyParams: { name: opt?.label ?? '' }, tone: 'good', deltas: e.deltas }
            : { kind: 'news', titleKey: 'budgetVote.title', textKey: 'popup.budgetFailed', tone: 'bad', deltas: e.deltas },
        );
        return;
      }
      case 'mandatory_growth':
        add({ kind: 'news', titleKey: 'budgetVote.title', textKey: 'popup.mandatoryGrowth', params: { pct: config.budgetVote.mandatoryGrowthPct }, tone: 'neutral', deltas: e.deltas });
        return;
      case 'opportunity_collected': {
        const opp = sim.data.opportunities.find((o) => o.id === e.opportunityId);
        add({ kind: 'news', titleKey: 'popup.opportunity', textKey: opp?.text, tone: 'good', deltas: e.deltas });
        return;
      }
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
    if (changed) this.ui = { ...this.ui, popups, floaters };
    for (const p of timedOut) {
      const ev = this.sim?.eventById.get(p.eventId!);
      this.ui = { ...this.ui, popups: this.ui.popups.filter((x) => x.id !== p.id) };
      this.dispatch({ kind: 'respond', eventInstanceId: p.instanceId!, responseId: ev?.responses?.default ?? '', timedOut: true });
    }
    return changed || timedOut.length > 0;
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
