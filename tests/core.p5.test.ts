import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { createBot, runToEnd } from '../src/core/bots';
import { distributeSeats, electionNight, projection } from '../src/core/election';
import { exportRun } from '../src/core/log';
import { comparableState, replay } from '../src/core/replay';
import { Rng } from '../src/core/rng';
import { computeScore, keyDecisions } from '../src/core/score';
import type { LogEntry } from '../src/core/types';
import { gameData, makeSim, quietSim } from './helpers';
import { totalDrainPerDay } from '../src/core/groupPressure';

const regions = () => gameData().regions;
const calmAnger = { oligarchs: 40, pensioners: 40, media: 40, eu: 40, activists: 40 };

describe('election model', () => {
  it('projection: S is the seat-weighted support, T rises with anger above 50', () => {
    const p = projection(config, regions(), 'mupka', 40, calmAnger, 45);
    expect(p.S).toBeCloseTo(40);
    expect(p.T).toBe(45);
    expect(p.P).toBeCloseTo(1 / (1 + Math.exp(5 / 8)));
    const angry = projection(config, regions(), 'mupka', 40, { ...calmAnger, oligarchs: 100 }, 45);
    expect(angry.T).toBeCloseTo(45 + 10);
  });

  it('empirical win rate matches P over 20k seeds (+-1.5 pp), seats sum to G, G >= 101 iff win', () => {
    for (const support of [38, 47, 55]) {
      const proj = projection(config, regions(), 'mupka', support, calmAnger, 45);
      let wins = 0;
      const N = 20000;
      for (let i = 0; i < N; i++) {
        const r = electionNight(config, regions(), proj, new Rng(`el-${support}-${i}`), false);
        if (r.win) wins++;
        const total = r.regions.reduce((s, x) => s + x.won, 0);
        expect(total).toBe(r.G);
        expect(r.G >= 101).toBe(r.win);
        for (const x of r.regions) expect(x.won).toBeLessThanOrEqual(x.seats);
      }
      expect(Math.abs(wins / N - proj.P)).toBeLessThan(0.015);
    }
  });

  it("D'Hondt split respects caps and gives more seats to stronger, larger regions", () => {
    const won = distributeSeats(
      [
        { code: 'A', seats: 10, s: 80 },
        { code: 'B', seats: 10, s: 20 },
        { code: 'C', seats: 2, s: 99 },
      ],
      15,
    );
    expect(won.A + won.B + won.C).toBe(15);
    expect(won.C).toBeLessThanOrEqual(2);
    expect(won.A).toBeGreaterThan(won.B);
    expect(distributeSeats([{ code: 'A', seats: 3, s: 50 }], 3).A).toBe(3);
  });

  it('a snap election uses the state at the moment Coalition hits 0', () => {
    const sim = quietSim({ seed: 'snap' });
    sim.state.resources.support = 63;
    sim.state.resources.coalition = 0.01;
    sim.tick();
    expect(sim.state.phase).toBe('election');
    expect(sim.state.election!.snap).toBe(true);
    const expected = projection(config, regions(), 'mupka', sim.state.resources.support, sim.state.anger, config.difficulty.normal.T_base);
    expect(sim.state.election!.S).toBeCloseTo(expected.S);
    expect(sim.state.quartersCompleted).toBe(0);
    expect(sim.state.log.some((l) => l.type === 'election')).toBe(true);
    expect(sim.state.log.at(-1)!.type).toBe('run_finished');
  });
});

describe('endings', () => {
  it('the Oligarchs ending fires at exactly 100, not at 99.9', () => {
    const sim = quietSim({ seed: 'olig' });
    sim.state.ongoing = [];
    sim.state.anger.oligarchs = 99.9 + 0.02; // decay pulls it back below 100 in the tick
    sim.tick();
    expect(sim.state.phase).toBe('running');
    sim.state.anger.oligarchs = 100;
    sim.tick();
    expect(sim.state.phase).toBe('ending');
    expect(sim.state.endingId).toBe('ending_oligarchs');
    expect(sim.state.outcome).toBe('ending');
    expect(sim.state.score).not.toBeNull();
  });

  it('fires immediately when a pick pushes Oligarchs to 100', () => {
    const sim = makeSim({ seed: 'olig2' });
    sim.state.anger.oligarchs = 99;
    sim.state.draft!.hand = ['dummy_ongoing', ...sim.state.draft!.hand.slice(1)]; // oligarchs +4
    sim.dispatch({ kind: 'pickPolicy', cardId: 'dummy_ongoing' });
    expect(sim.state.phase).toBe('ending');
  });

  it('an ending wins over a snap election on the same day', () => {
    const sim = quietSim({ seed: 'both' });
    sim.state.ongoing = []; // the drafted card's ongoing effects must not move the meter
    sim.state.anger.oligarchs = 100;
    sim.state.resources.coalition = 0;
    sim.tick();
    expect(sim.state.phase).toBe('ending');
  });

  it('unbuilt endings cap the meter and apply the stand-in penalty instead', () => {
    const sim = quietSim({ seed: 'standin' });
    sim.state.ongoing = [];
    sim.state.anger.media = 100;
    const s0 = sim.state.resources.support;
    const pressure = totalDrainPerDay(config, { ...sim.state.anger }, 'support');
    sim.tick();
    expect(sim.state.phase).toBe('running');
    // drift + stand-in penalty + interest-group pressure (P24)
    expect(s0 - sim.state.resources.support).toBeCloseTo(-config.drift.support + 0.3 + pressure);
    expect(sim.state.anger.media).toBe(100);
  });
});

describe('score and key decisions', () => {
  it('follows the score formula', () => {
    const res = { finances: 50, support: 40, coalition: 30, prestige: 20 };
    const anger = { oligarchs: 20, pensioners: 40, media: 60, eu: 80, activists: 100 };
    const expected = Math.round(1000 + 400 * 0.6 + 25 * 16 + 140 + (80 + 60 + 40 + 20 + 0) / 2);
    expect(computeScore(config, true, 0.6, 16, res, anger)).toBe(expected);
  });

  it('key decisions: top 5 by impact among decision types, in chronological order', () => {
    const e = (type: string, absDay: number, support: number, anger = 0): LogEntry =>
      ({ type, absDay, deltas: { resources: { support }, anger: { media: anger } } }) as unknown as LogEntry;
    const log = [
      e('policy_picked', 1, 1),
      e('chaos_fired', 2, -9),
      e('opportunity_collected', 3, 50), // not a decision type
      e('event_response', 4, 2, 10), // 2 + 5 = 7
      e('budget_vote', 5, -6),
      e('ability_used', 6, 10),
      e('policy_picked', 7, 3),
      e('policy_picked', 8, 0.5),
    ];
    const kd = keyDecisions(log, config);
    expect(kd.map((x) => x.absDay)).toEqual([2, 4, 5, 6, 7]);
  });
});

describe('replay', () => {
  for (const bot of ['random', 'greedy'] as const) {
    it(`a ${bot}-bot run replays to the identical final state and score`, () => {
      const sim = makeSim({ seed: `replay-${bot}`, now: () => 12345 });
      runToEnd(sim, createBot(bot, `replay-${bot}`));
      expect(sim.isOver).toBe(true);
      const exported = JSON.parse(JSON.stringify(exportRun(sim.state)));
      expect(exported.inputs.length).toBeGreaterThan(10);
      const kinds = new Set(exported.inputs.map((i: { input: { kind: string } }) => i.input.kind));
      expect(kinds.has('pickPolicy')).toBe(true);
      const again = replay(gameData(), config, exported);
      expect(again.state.score).toBe(sim.state.score);
      expect(comparableState(again.state)).toEqual(comparableState(sim.state));
    });
  }

  it('the log starts with run_started (seed, leader, difficulty, data hashes) and ends with run_finished', () => {
    const sim = makeSim({ seed: 'logcheck' });
    runToEnd(sim, createBot('random', 'logcheck'));
    const first = sim.state.log[0];
    expect(first.type).toBe('run_started');
    expect(first.seed).toBe('logcheck');
    expect(Object.keys(first.dataFiles as object).length).toBeGreaterThan(5);
    expect(sim.state.log.at(-1)!.type).toBe('run_finished');
    for (const t of ['draft_shown', 'policy_picked', 'chaos_scheduled']) expect(sim.state.log.some((l) => l.type === t)).toBe(true);
  });
});

describe('bots', () => {
  it('greedy and random bots finish runs for both leaders on every difficulty', () => {
    for (const leader of ['mupka', 'abis'])
      for (const difficulty of ['easy', 'normal', 'hard'] as const)
        for (const bot of ['random', 'greedy'] as const) {
          const sim = makeSim({ seed: `b-${leader}-${difficulty}-${bot}`, leader, difficulty });
          const r = runToEnd(sim, createBot(bot, 'x'));
          expect(['win', 'loss', 'ending']).toContain(r.outcome);
        }
  });
});
