import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { Rng } from '../src/core/rng';
import { exportRun } from '../src/core/log';
import { comparableState, replay } from '../src/core/replay';
import type { GroupId, LogEntry, ResourceId } from '../src/core/types';
import { planLife, type LifeContext } from '../src/regions/lifeDirector';
import { REGION_PATHS } from '../src/regions/regionsPath';
import { SPRITES, spriteRects } from '../src/regions/sprites';
import { initStore } from '../src/ui/store';
import { createBot, runToEnd } from '../src/core/bots';
import { isDecisionEntry } from '../src/regions/flagPulse';
import { FLAG_COLUMNS } from '../src/regions/Liquid';
import { gameData, makeSim } from './helpers';

describe('waving flag', () => {
  it('its strips draw the flag: the triangle narrows to nothing at the middle, then only white and red', () => {
    const first = FLAG_COLUMNS[0];
    const last = FLAG_COLUMNS[FLAG_COLUMNS.length - 1];
    const middleOf = (c: typeof first) => (c.blueTop + c.blueBottom) / 2;
    expect(first.blueBottom - first.blueTop).toBeGreaterThan(0);
    expect(last.blueBottom - last.blueTop).toBe(0);
    expect(middleOf(first)).toBeCloseTo(middleOf(last));
    const halfway = FLAG_COLUMNS[Math.ceil(FLAG_COLUMNS.length / 2)];
    expect(halfway.blueBottom - halfway.blueTop).toBe(0);
    for (const [i, c] of FLAG_COLUMNS.entries()) {
      if (i > 0) expect(c.blueBottom - c.blueTop).toBeLessThanOrEqual(FLAG_COLUMNS[i - 1].blueBottom - FLAG_COLUMNS[i - 1].blueTop);
    }
  });

  it('the strips reach both ends of the map', () => {
    const xs = REGION_PATHS.flatMap((r) => (r.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0));
    const last = FLAG_COLUMNS[FLAG_COLUMNS.length - 1];
    expect(FLAG_COLUMNS[0].x).toBeLessThanOrEqual(Math.min(...xs));
    expect(last.x + config.regions.flagColumnWidth).toBeGreaterThanOrEqual(Math.max(...xs));
  });
});

describe('flag fade after a decision', () => {
  const entry =(type: string, extra: Record<string, unknown> = {}) => ({ type, ...extra }) as LogEntry;

  it('plays for choices the player made', () => {
    for (const type of ['policy_picked', 'compromise_made', 'budget_vote', 'event_response', 'demand_accepted', 'demand_rejected', 'region_event_intervened', 'region_event_ignored', 'region_action', 'ability_used', 'upgrade_action', 'upgrade_bought']) {
      expect(isDecisionEntry(entry(type)), type).toBe(true);
    }
  });

  it('does not play for a timer running out', () => {
    expect(isDecisionEntry(entry('event_response', { timedOut: true }))).toBe(false);
    expect(isDecisionEntry(entry('region_event_ignored', { timedOut: true }))).toBe(false);
  });

  it('does not play for what happens on its own', () => {
    for (const type of ['quarter_started', 'chaos_fired', 'demand_ignored', 'region_event_spawned', 'ability_pulse', 'draft_shown']) {
      expect(isDecisionEntry(entry(type)), type).toBe(false);
    }
  });

  it('a played run logs policy picks and budget votes under these names', () => {
    const sim = makeSim({ seed: 'flag', leader: 'mupka' });
    runToEnd(sim, createBot('greedy', 'flag'));
    const types = new Set(sim.state.log.filter(isDecisionEntry).map((e) => e.type));
    expect(types).toContain('policy_picked');
    expect(types).toContain('budget_vote');
  });
});

const REGIONS = REGION_PATHS.map((r) => r.code);
const L = config.life;
const pulse = config.anger.pulseAt;

function ctx(patch: Partial<LifeContext> = {}): LifeContext {
  return {
    resources: { finances: 50, support: 50, coalition: 50, prestige: 50 } as Record<ResourceId, number>,
    anger: { oligarchs: 40, pensioners: 40, media: 40, eu: 40, activists: 40 } as Record<GroupId, number>,
    regionSupport: Object.fromEntries(REGIONS.map((r) => [r, 50])),
    zeroFinances: false,
    entries: [],
    days: 0,
    ambient: true,
    active: [],
    regions: REGIONS,
    distance: () => 300,
    maxActors: 99,
    ...patch,
  };
}

/** Many separate one-day calls (as the store makes them), collecting every spawn. */
function many(c: LifeContext, seed: string, lc = L, calls = 400) {
  const rng = new Rng(seed);
  return Array.from({ length: calls }, () => planLife({ ...c, days: 1 }, rng, lc, pulse)).flat();
}

const entry = (type: string, extra: Partial<LogEntry> = {}): LogEntry =>
  ({ type, quarter: 1, day: 1, absDay: 1, date: '', wallTime: 0, snapshot: {} as LogEntry['snapshot'], ...extra }) as LogEntry;

describe('living map director', () => {
  it('is deterministic for a seed', () => {
    const c = ctx({ days: 40, resources: { finances: 80, support: 50, coalition: 50, prestige: 50 } });
    expect(planLife(c, new Rng('s'), L, pulse)).toEqual(planLife(c, new Rng('s'), L, pulse));
  });

  it('spawns protest crowds only in kraje with low regional support', () => {
    const low = ['CZ041', 'CZ080'];
    const regionSupport = Object.fromEntries(REGIONS.map((r) => [r, low.includes(r) ? L.crowdBelow - 5 : 60]));
    const out = many(ctx({ regionSupport }), 'crowd', { ...L, truckPerDay: 0, limoPerDay: 0 });
    const crowds = out.filter((a) => a.kind === 'crowd');
    expect(crowds.length).toBeGreaterThan(0);
    expect(new Set(crowds.map((a) => a.region))).toEqual(new Set(low));
  });

  it('angry groups add crowds with their placard colour', () => {
    const anger = { oligarchs: 0, pensioners: pulse + 5, media: 0, eu: 0, activists: 0 } as Record<GroupId, number>;
    const out = many(ctx({ anger }), 'anger');
    expect(out.some((a) => a.kind === 'crowd' && a.variant === 'pensioners')).toBe(true);
    expect(out.some((a) => a.variant === 'media')).toBe(false);
  });

  it('a passed budget vote sends a staggered gold convoy out of the capital; a failed one brings a crowd there', () => {
    const passed = planLife(ctx({ entries: [entry('budget_vote', { passed: true })] }), new Rng('b'), L, pulse);
    const convoy = passed.filter((a) => a.kind === 'truck');
    expect(convoy).toHaveLength(L.convoy);
    expect(convoy.every((a) => a.region === L.capital && a.to !== L.capital && a.variant === 'gold')).toBe(true);
    expect(convoy.map((a) => a.delayMs)).toEqual(convoy.map((_, i) => i * L.convoyStaggerMs));
    const failed = planLife(ctx({ entries: [entry('budget_vote', { passed: false })] }), new Rng('b'), L, pulse);
    expect(failed).toEqual([expect.objectContaining({ kind: 'crowd', region: L.capital })]);
  });

  it('a chaos event causes a blackout and a crowd', () => {
    const kinds = planLife(ctx({ entries: [entry('chaos_fired')] }), new Rng('c'), L, pulse).map((a) => a.kind);
    expect(kinds).toEqual(['blackout', 'crowd']);
  });

  it('regional shifts show fireworks (gain) and rain (loss) over exactly those kraje', () => {
    const e = entry('compromise_made', { deltas: { resources: {}, anger: {}, regions: { CZ010: 4, CZ080: -3, CZ041: 0.2 } } });
    const out = planLife(ctx({ entries: [e] }), new Rng('r'), L, pulse);
    expect(out.map((a) => [a.kind, a.region])).toEqual([
      ['firework', 'CZ010'],
      ['rain', 'CZ080'],
    ]);
  });

  it('trucks drive empty when finances are low, and blackouts come while finances are low', () => {
    const out = many(ctx({ resources: { finances: 5, support: 50, coalition: 50, prestige: 50 } }), 't', { ...L, crowdPerDay: 0 }, 1500);
    const trucks = out.filter((a) => a.kind === 'truck');
    expect(trucks.length).toBeGreaterThan(0);
    expect(trucks.every((a) => a.variant === 'empty' && a.to !== a.region)).toBe(true);
    expect(out.some((a) => a.kind === 'blackout')).toBe(true);
  });

  it('spawns at most one ambient actor per call, none without the quiet gap, and events regardless', () => {
    const regionSupport = Object.fromEntries(REGIONS.map((r) => [r, 0]));
    const busy = ctx({ regionSupport, days: 50, resources: { finances: 100, support: 50, coalition: 50, prestige: 50 } });
    const out = planLife(busy, new Rng('one'), L, pulse);
    expect(out).toHaveLength(1);
    expect(out[0].ambient).toBe(true);
    expect(planLife({ ...busy, ambient: false }, new Rng('one'), L, pulse)).toEqual([]);
    const ev = planLife({ ...busy, ambient: false, entries: [entry('chaos_fired')] }, new Rng('one'), L, pulse);
    expect(ev.map((a) => a.kind)).toEqual(['blackout', 'crowd']);
    expect(ev.some((a) => a.ambient)).toBe(false);
  });

  it('cows wander only into rural kraje, as ordinary (capped) actors', () => {
    const out = many(ctx(), 'cows', { ...L, truckPerDay: 0, limoPerDay: 0 });
    const cows = out.filter((a) => a.kind === 'cow');
    expect(cows.length).toBeGreaterThan(0);
    expect(cows.every((a) => L.cowRegions.includes(a.region) && a.ambient && (a.n === 1 || a.n === 2))).toBe(true);
    const full = [{ kind: 'cow' as const, region: 'CZ031' }, { kind: 'truck' as const, region: 'CZ010' }, { kind: 'crowd' as const, region: 'CZ080' }];
    expect(many(ctx({ active: full, maxActors: 3 }), 'full', L, 50)).toEqual([]);
  });

  it('respects the actor cap (counting actors already on the map)', () => {
    const regionSupport = Object.fromEntries(REGIONS.map((r) => [r, 0]));
    const active = [{ kind: 'truck' as const, region: 'CZ010' }, { kind: 'truck' as const, region: 'CZ020' }];
    const out = planLife(ctx({ regionSupport, days: 500, active, maxActors: 3, entries: [entry('chaos_fired')] }), new Rng('cap'), L, pulse);
    expect(out.length).toBe(1);
  });

  it('sprites only use known palette pixels', () => {
    for (const frames of Object.values(SPRITES)) for (const g of frames) expect(() => spriteRects(g)).not.toThrow();
  });
});

describe('living map in the store', () => {
  it('spawns while the run is running (at most the cap), prunes expired actors, and spawns nothing with reduced motion', () => {
    // actors are timed on the store's map clock, which store.frame(ms) advances: 1 s per game day, so the
    // ambient quiet gap passes during the loop
    const store = initStore({ ok: true, data: gameData(), warnings: [] });
    store.startRun('mupka', 'normal');
    const sim = store.sim!;
    store.ui = { ...store.ui, tutorialQueue: [], tutorial: null };
    sim.dispatch({ kind: 'pickPolicy', cardId: sim.state.draft!.hand[0] });
    sim.state.schedule = [];
    let seen = 0;
    for (let i = 0; i < 60; i++) {
      store.frame(1000, true);
      sim.tick();
      seen += store.ui.actors.length;
      expect(store.ui.actors.length).toBeLessThanOrEqual(config.life.maxActors);
    }
    expect(seen).toBeGreaterThan(0);
    // all expire after their lifetime
    store.frame(60_000, true);
    expect(store.ui.actors).toHaveLength(0);

    store.setSettings({ reducedMotion: true });
    for (let i = 0; i < 60; i++) {
      store.frame(1000, true);
      sim.tick();
    }
    expect(store.ui.actors).toHaveLength(0);
  });

  it('weekly trend points carry the projection, and replays still match', () => {
    const sim = makeSim({ seed: 'trend-p' });
    runToEnd(sim, createBot('random', 'trend-p'));
    expect(sim.state.trend.length).toBeGreaterThan(1);
    expect(sim.state.trend.every((p) => p.P >= 0 && p.P <= 1)).toBe(true);
    const again = replay(gameData(), config, JSON.parse(JSON.stringify(exportRun(sim.state))));
    expect(comparableState(again.state)).toEqual(comparableState(sim.state));
  });
});
