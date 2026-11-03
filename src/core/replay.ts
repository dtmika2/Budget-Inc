/** Rebuild a run from its seed + ordered inputs (spec §10.2). */
import type { Config } from '../config';
import type { RunExport } from './log';
import { Simulation } from './simulation';
import type { DifficultyId, GameData, GameState } from './types';

export function replay(data: GameData, cfg: Config, run: Pick<RunExport, 'seed' | 'leader' | 'difficulty' | 'inputs'>): Simulation {
  const sim = new Simulation(data, cfg, { seed: run.seed, leader: run.leader, difficulty: run.difficulty as DifficultyId });
  for (const rec of run.inputs) {
    while (sim.state.tickCount < rec.tick) {
      if (sim.state.phase !== 'running') {
        throw new Error(`Replay diverged: phase ${sim.state.phase} at tick ${sim.state.tickCount}, next input at ${rec.tick}`);
      }
      sim.tick();
    }
    const r = sim.dispatch(rec.input);
    if (!r.ok) throw new Error(`Replay diverged: input ${JSON.stringify(rec.input)} rejected (${r.reason}) at tick ${rec.tick}`);
  }
  while (!sim.isOver && sim.state.phase === 'running') sim.tick();
  return sim;
}

/** State without wall-clock timestamps, for comparing a run with its replay. */
export function comparableState(state: GameState): unknown {
  return JSON.parse(JSON.stringify({ ...state, log: state.log.map((e) => ({ ...e, wallTime: 0 })) }));
}
