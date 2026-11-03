/**
 * Headless simulator (spec §13).
 *
 *   npm run simulate -- --runs 500 --bot greedy --leader both --difficulty normal --seed sim
 *
 * Prints win rate, average run length (quarters), average score, and how often each ending,
 * snap election and pool relaxation happened. `--json` prints machine-readable results.
 */
import { config } from '../src/config';
import { createBot, runToEnd, type BotKind, type RunSummary } from '../src/core/bots';
import { Simulation } from '../src/core/simulation';
import type { DifficultyId } from '../src/core/types';
import { mustLoad } from './lib/nodeData';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}

const runs = Number(arg('runs', '200'));
const bots = (arg('bot', 'random') === 'both' ? ['random', 'greedy'] : [arg('bot', 'random')]) as BotKind[];
const leaderArg = arg('leader', 'both');
const diffArg = arg('difficulty', 'normal');
const seedBase = arg('seed', 'sim');
const asJson = process.argv.includes('--json');

const data = mustLoad();
const leaders = leaderArg === 'both' ? data.leaders.map((l) => l.id) : [leaderArg];
const difficulties = (diffArg === 'all' ? ['easy', 'normal', 'hard'] : [diffArg]) as DifficultyId[];

export interface Row {
  bot: BotKind;
  leader: string;
  difficulty: DifficultyId;
  runs: number;
  winRate: number;
  avgQuarters: number;
  avgScore: number;
  endingRate: number;
  snapRate: number;
  relaxRate: number;
  endings: Record<string, number>;
  outcomes: Record<string, number>;
}

const rows: Row[] = [];
const t0 = performance.now();
for (const bot of bots) {
  for (const leader of leaders) {
    for (const difficulty of difficulties) {
      const results: RunSummary[] = [];
      for (let i = 0; i < runs; i++) {
        const seed = `${seedBase}-${bot}-${leader}-${difficulty}-${i}`;
        const sim = new Simulation(data, config, { seed, leader, difficulty });
        results.push(runToEnd(sim, createBot(bot, seed)));
      }
      const n = results.length || 1;
      const endings: Record<string, number> = {};
      const outcomes: Record<string, number> = {};
      for (const r of results) {
        outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
        if (r.endingId) endings[r.endingId] = (endings[r.endingId] ?? 0) + 1;
      }
      rows.push({
        bot,
        leader,
        difficulty,
        runs: results.length,
        winRate: results.filter((r) => r.outcome === 'win').length / n,
        avgQuarters: results.reduce((s, r) => s + r.quartersCompleted, 0) / n,
        avgScore: results.reduce((s, r) => s + r.score, 0) / n,
        endingRate: results.filter((r) => r.endingId).length / n,
        snapRate: results.filter((r) => r.snap).length / n,
        relaxRate: results.filter((r) => r.relaxations > 0).length / n,
        endings,
        outcomes,
      });
    }
  }
}
const secs = (performance.now() - t0) / 1000;

if (asJson) {
  console.log(JSON.stringify({ runs, seconds: secs, rows }, null, 2));
} else {
  const pct = (x: number) => `${(x * 100).toFixed(1)} %`.padStart(8);
  console.log(`Budget Inc. simulator — ${runs} runs per row, seed "${seedBase}", ${secs.toFixed(1)} s`);
  console.log('bot     leader  diff     win rate  avg Q  avg score   ending    snap   relaxed');
  for (const r of rows) {
    console.log(
      `${r.bot.padEnd(7)} ${r.leader.padEnd(7)} ${r.difficulty.padEnd(7)} ${pct(r.winRate)}  ${r.avgQuarters.toFixed(1).padStart(5)}  ${r.avgScore
        .toFixed(0)
        .padStart(9)}  ${pct(r.endingRate)} ${pct(r.snapRate)} ${pct(r.relaxRate)}`,
    );
  }
  const t = config.simulatorTargets;
  console.log(
    `targets (normal): random <= ${t.randomMaxWinRate * 100} %, greedy ${t.greedyMinWinRate * 100}–${t.greedyMaxWinRate * 100} %`,
  );
}
