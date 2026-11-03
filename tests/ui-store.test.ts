import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { initStore, visiblePopups, type Actor, type Popup } from '../src/ui/store';
import { gameData } from './helpers';

const popup = (id: number, kind: Popup['kind']): Popup => ({ id, kind, titleKey: 'x', tone: 'neutral', remainingMs: 1000, totalMs: 1000 });

describe('ui store', () => {
  it('shows at most N pop-ups with respondable ones first', () => {
    const list = [popup(1, 'news'), popup(2, 'news'), popup(3, 'response'), popup(4, 'news')];
    expect(visiblePopups(list, 3).map((p) => p.id)).toEqual([3, 1, 2]);
    expect(visiblePopups(list, 2).map((p) => p.id)).toEqual([3, 1]);
  });

  it('turns a respondable chaos event into a response pop-up that times out to the default', () => {
    const data = { ...gameData(), events: gameData().events.map((e) => ({ ...e, chance: 1 })) };
    const store = initStore({ ok: true, data, warnings: [] });
    store.startRun('mupka', 'normal');
    const sim = store.sim!;
    store.ui = { ...store.ui, tutorialQueue: [], tutorial: null };
    sim.dispatch({ kind: 'pickPolicy', cardId: sim.state.draft!.hand[0] });
    sim.state.schedule = [{ seq: 9999, kind: 'chaos', absDay: sim.absDay, payload: { eventId: 'dummy_evt_2' } }];
    sim.tick();
    const resp = store.ui.popups.find((p) => p.kind === 'response');
    expect(resp).toBeDefined();
    // the countdown does not run while paused
    store.frame(config.popups.responseTimeoutSec * 1000 + 100, false);
    expect(store.ui.popups.some((p) => p.id === resp!.id)).toBe(true);
    // ... and runs out while the game runs
    store.frame(config.popups.responseTimeoutSec * 1000 + 100, true);
    const log = sim.state.log.find((e) => e.type === 'event_response')!;
    expect(log.timedOut).toBe(true);
    expect(log.responseId).toBe('ignore');
    expect(store.ui.popups.some((p) => p.id === resp!.id)).toBe(false);
  });

  it('news pop-ups auto-dismiss after popupSeconds', () => {
    const store = initStore({ ok: true, data: gameData(), warnings: [] });
    store.startRun('abis', 'normal');
    store.ui = { ...store.ui, popups: [popup(1, 'news')].map((p) => ({ ...p, remainingMs: 5000, totalMs: 5000 })) };
    store.frame(4000, false);
    expect(store.ui.popups).toHaveLength(1);
    store.frame(1500, false);
    expect(store.ui.popups).toHaveLength(0);
  });

  it('the living map runs at the game speed', () => {
    const store = initStore({ ok: true, data: gameData(), warnings: [] });
    store.startRun('mupka', 'normal');
    const sim = store.sim!;
    store.ui = { ...store.ui, tutorialQueue: [], tutorial: null };
    sim.dispatch({ kind: 'pickPolicy', cardId: sim.state.draft!.hand[0] });
    const actor = { id: 1, kind: 'cow', region: 'CZ010', n: 1, ttlMs: 1000, delayMs: 0, u: 0, v: 0, born: 0 } as unknown as Actor;
    const run = (speed: number, ms: number, running = true) => {
      // spawned now: born = the store's current map clock
      const born = (store as unknown as { mapClock: number }).mapClock;
      store.ui = { ...store.ui, speed, userPaused: !running, actors: [{ ...actor, born }] };
      store.frame(ms, running);
      return store.ui.actors.length;
    };
    expect(run(1, 600)).toBe(1); // 600 ms at 1x: still walking
    expect(run(4, 300)).toBe(0); // 300 ms at 4x = 1200 ms of map time: gone
    expect(run(4, 600, false)).toBe(1); // paused: the map runs at 1x
    store.ui = { ...store.ui, speed: 4, userPaused: false };
    expect(store.mapTempo).toBe(4);
    store.ui = { ...store.ui, userPaused: true };
    expect(store.mapTempo).toBe(1);
  });
});
