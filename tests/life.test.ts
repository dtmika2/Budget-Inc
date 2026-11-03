import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { Rng } from '../src/core/rng';
import { exportRun } from '../src/core/log';
import { comparableState, replay } from '../src/core/replay';
import type { GroupId, LogEntry, ResourceId } from '../src/core/types';
import { planLife, type LifeContext } from '../src/ui/map/lifeDirector';
import { REGION_PATHS } from '../src/ui/map/regionsPath';
import { SPRITES, spriteRects } from '../src/ui/map/sprites';
import { initStore } from '../src/ui/store';
import { createBot, runToEnd } from '../src/core/bots';
import { gameData, makeSim } from './helpers';

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
    active: [],
    regions: REGIONS,
    distance: () => 300,
    maxActors: 99,
    ...patch,
  };
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
    const out = planLife(ctx({ regionSupport, days: 400 }), new Rng('crowd'), { ...L, truckPerDay: 0, limoPerDay: 0 }, pulse);
    const crowds = out.filter((a) => a.kind === 'crowd');
    expect(crowds.length).toBeGreaterThan(0);
    expect(new Set(crowds.map((a) => a.region))).toEqual(new Set(low));
    // at most one crowd per kraj at a time
    expect(crowds.length).toBe(new Set(crowds.map((a) => a.region)).size);
  });

  it('angry groups add crowds with their placard colour', () => {
    const anger = { oligarchs: 0, pensioners: pulse + 5, media: 0, eu: 0, activists: 0 } as Record<GroupId, number>;
    const out = planLife(ctx({ anger, days: 200 }), new Rng('anger'), L, pulse);
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
    const out = planLife(ctx({ days: 600, resources: { finances: 5, support: 50, coalition: 50, prestige: 50 } }), new Rng('t'), { ...L, crowdPerDay: 0 }, pulse);
    const trucks = out.filter((a) => a.kind === 'truck');
    expect(trucks.length).toBeGreaterThan(0);
    expect(trucks.every((a) => a.variant === 'empty' && a.to !== a.region)).toBe(true);
    expect(out.some((a) => a.kind === 'blackout')).toBe(true);
  });

  it('respects the actor cap (counting actors already on the map)', () => {
    const regionSupport = Object.fromEntries(REGIONS.map((r) => [r, 0]));
    const active = [{ kind: 'truck' as const, region: 'CZ010' }, { kind: 'truck' as const, region: 'CZ020' }];
    const out = planLife(ctx({ regionSupport, days: 500, active, maxActors: 5, entries: [entry('chaos_fired')] }), new Rng('cap'), L, pulse);
    expect(out.length).toBe(3);
  });

  it('sprites only use known palette pixels', () => {
    for (const frames of Object.values(SPRITES)) for (const g of frames) expect(() => spriteRects(g)).not.toThrow();
  });
});

describe('living map in the store', () => {
  it('spawns while the run is running, prunes expired actors, and spawns nothing with reduced motion', () => {
    const store = initStore({ ok: true, data: gameData(), warnings: [] });
    store.startRun('mupka', 'normal');
    const sim = store.sim!;
    store.ui = { ...store.ui, tutorialQueue: [], tutorial: null };
    sim.dispatch({ kind: 'pickPolicy', cardId: sim.state.draft!.hand[0] });
    sim.state.schedule = [];
    for (let i = 0; i < 60; i++) sim.tick();
    expect(store.ui.actors.length).toBeGreaterThan(0);
    expect(store.ui.actors.length).toBeLessThanOrEqual(config.life.maxActors);
    // all expire after their lifetime
    const far = Math.max(...store.ui.actors.map((a) => a.born + a.delayMs + a.ttlMs));
    const realNow = performance.now;
    performance.now = () => far + 1;
    store.frame(16, true);
    performance.now = realNow;
    expect(store.ui.actors).toHaveLength(0);

    store.setSettings({ reducedMotion: true });
    for (let i = 0; i < 60; i++) sim.tick();
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
