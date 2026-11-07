import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { usedCheats } from '../src/core/cheats';
import { comparableState, replay } from '../src/core/replay';
import { Simulation } from '../src/core/simulation';
import { gameData } from './helpers';

const RUN = { seed: 'cheats', leader: 'mupka', difficulty: 'normal' } as const;
const newSim = () => new Simulation(gameData(), config, RUN);

describe('cheat codes', () => {
  it('PK1000 gives 1000 PK', () => {
    const sim = newSim();
    const before = sim.state.pc;
    expect(sim.dispatch({ kind: 'cheat', code: 'PK1000' }).ok).toBe(true);
    expect(sim.state.pc).toBe(before + 1000);
    expect(usedCheats(sim.state)).toBe(true);
  });

  it('ignores case and surrounding spaces', () => {
    const sim = newSim();
    const before = sim.state.pc;
    expect(sim.dispatch({ kind: 'cheat', code: '  pk1000 ' }).ok).toBe(true);
    expect(sim.state.pc).toBe(before + 1000);
  });

  it.each(['PK999', 'PK10000', '', 'constructor', '__proto__'])('rejects %j and changes nothing', (code) => {
    const sim = newSim();
    const before = sim.state.pc;
    expect(sim.dispatch({ kind: 'cheat', code }).ok).toBe(false);
    expect(sim.state.pc).toBe(before);
    expect(usedCheats(sim.state)).toBe(false);
  });

  it('a run without a cheat does not count as cheated', () => {
    expect(usedCheats(newSim().state)).toBe(false);
  });

  it('a run with a cheat replays to the same state', () => {
    const sim = newSim();
    sim.dispatch({ kind: 'cheat', code: 'PK1000' });
    const again = replay(gameData(), config, { ...RUN, inputs: sim.state.inputs });
    while (!sim.isOver && sim.state.phase === 'running') sim.tick();
    expect(comparableState(again.state)).toEqual(comparableState(sim.state));
  });
});
