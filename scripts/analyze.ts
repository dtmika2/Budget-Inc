/**
 * Balance helper: average end-of-run state per bot x leader (dev tool for the P9 balance pass).
 *   npx tsx scripts/analyze.ts --runs 300 --difficulty normal
 */
import { config } from '../src/config';
import { createBot, runToEnd, type BotKind } from '../src/core/bots';
import { Simulation } from '../src/core/simulation';
import type { DifficultyId } from '../src/core/types';
import { GROUP_IDS, RESOURCE_IDS } from '../src/core/types';
import { mustLoad } from './lib/nodeData';

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const runs = Number(arg('runs', '300'));
const only = arg('bot', 'both');
const difficulty = arg('difficulty', 'normal') as DifficultyId;
const data = mustLoad();

// --set a.b.c=value (repeatable): override config values for experiments without editing config.ts
process.argv.forEach((a, i) => {
  if (a !== '--set') return;
  const [path, raw] = process.argv[i + 1].split('=');
  const keys = path.split('.');
  let o = config as unknown as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[keys.at(-1)!] = Number(raw);
});

// --leader abis.start.support=47 or abis.ability.bundle.effects.support.max=5 (in memory only)
process.argv.forEach((a, i) => {
  if (a !== '--leader') return;
  const [path, raw] = process.argv[i + 1].split('=');
  const [id, ...keys] = path.split('.');
  let o = data.leaders.find((l) => l.id === id) as unknown as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[keys.at(-1)!] = Number(raw);
});

for (const bot of (only === 'both' ? ['random', 'greedy'] : [only]) as BotKind[]) {
  for (const leader of data.leaders.map((l) => l.id)) {
    const acc: Record<string, number> = {};
    const add = (k: string, v: number) => (acc[k] = (acc[k] ?? 0) + v / runs);
    const endQ: Record<string, number> = {};
    for (let i = 0; i < runs; i++) {
      const seed = `an-${bot}-${leader}-${i}`;
      const sim = new Simulation(data, config, { seed, leader, difficulty });
      const r = runToEnd(sim, createBot(bot, seed));
      const s = sim.state;
      for (const res of RESOURCE_IDS) add(res, s.resources[res]);
      for (const g of GROUP_IDS) add(`a.${g}`, s.anger[g]);
      add('P', s.election?.P ?? s.projection.P);
      add('S', s.election?.S ?? s.projection.S);
      add('T', s.election?.T ?? s.projection.T);
      add('win', r.outcome === 'win' ? 1 : 0);
      add('Q', r.quartersCompleted);
      add('snap', r.snap ? 1 : 0);
      add('pc', s.pc);
      add('upg', s.ownedUpgrades.length);
      add('zeroF', s.log.some((e) => e.type === 'zero_penalty_started' && e.resource === 'finances') ? 1 : 0);
      add('zeroS', s.log.some((e) => e.type === 'zero_penalty_started' && e.resource === 'support') ? 1 : 0);
      add('voteFail', s.log.filter((e) => e.type === 'budget_vote' && !e.passed).length);
      const k = r.snap ? 'snap' : r.endingId ? 'ending' : 'term';
      endQ[k] = (endQ[k] ?? 0) + 1;
    }
    const f = (k: string, d = 1) => (acc[k] ?? 0).toFixed(d);
    console.log(
      `${bot.padEnd(6)} ${leader.padEnd(5)} win ${f('win', 2)} Q ${f('Q')} snap ${f('snap', 2)} | fin ${f('finances')} sup ${f('support')} coa ${f('coalition')} pre ${f('prestige')} | ` +
        `olig ${f('a.oligarchs')} pens ${f('a.pensioners')} med ${f('a.media')} eu ${f('a.eu')} act ${f('a.activists')} | S ${f('S')} T ${f('T')} P ${f('P', 2)} | ` +
        `upg ${f('upg')} zeroF ${f('zeroF', 2)} zeroS ${f('zeroS', 2)} voteFail ${f('voteFail', 2)} ends ${JSON.stringify(endQ)}`,
    );
  }
}
