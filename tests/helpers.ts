import { config, type Config } from '../src/config';
import { Simulation, type SimOptions } from '../src/core/simulation';
import type { GameData } from '../src/core/types';
import { mustLoad } from '../scripts/lib/nodeData';

let cached: GameData | null = null;
export function gameData(): GameData {
  if (!cached) cached = mustLoad();
  return cached;
}

export function cfgWith(patch: (c: Config) => void): Config {
  const c = JSON.parse(JSON.stringify(config)) as Config;
  patch(c);
  return c;
}

export function makeSim(opts: Partial<SimOptions> = {}, cfg: Config = config, data: GameData = gameData()): Simulation {
  return new Simulation(data, cfg, { seed: 'test-seed', leader: 'mupka', difficulty: 'normal', ...opts });
}

/** Resolve any open modal phase in the simplest way (first card / first budget option). */
export function resolveModal(sim: Simulation): void {
  const s = sim.state;
  if (s.phase === 'draft' && s.draft) sim.dispatch({ kind: 'pickPolicy', cardId: s.draft.hand[0] });
  else if (s.phase === 'budgetVote') sim.dispatch({ kind: 'voteBudget', optionId: sim.data.budgetVote[1].id });
  else if (s.phase === 'compromise' && s.compromiseOffer) sim.dispatch({ kind: 'makeCompromise', cardId: s.compromiseOffer[0] });
}

/** A sim in phase running with no chaos/pins scheduled (budget votes kept). */
export function quietSim(opts: Partial<SimOptions> = {}, cfg: Config = config): Simulation {
  const sim = makeSim(opts, cfg);
  resolveModal(sim);
  sim.state.schedule = sim.state.schedule.filter((e) => e.kind === 'budgetVote');
  return sim;
}

/** Tick `days` running days, resolving modals and removing chaos/pins as they get scheduled. */
export function advanceQuiet(sim: Simulation, days: number): void {
  for (let i = 0; i < days && !sim.isOver; ) {
    if (sim.state.phase !== 'running') {
      resolveModal(sim);
      sim.state.schedule = sim.state.schedule.filter((e) => e.kind === 'budgetVote');
      continue;
    }
    sim.tick();
    if (sim.state.phase === 'running') i++;
  }
}
