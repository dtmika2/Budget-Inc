/** Interest-group endings (spec §4.5), data-driven from data/endings.json. */
import type { EndingDef, GameState } from './types';

const EPS = 1e-9;

/** The first BUILT ending whose meter has reached its threshold, if any. */
export function triggeredEnding(endings: readonly EndingDef[], state: GameState): EndingDef | null {
  for (const e of endings) if (e.built && state.anger[e.group] >= e.threshold - EPS) return e;
  return null;
}

/** Endings that are reached but not built yet (their stand-in penalty is active). */
export function standInActive(endings: readonly EndingDef[], state: GameState): EndingDef[] {
  return endings.filter((e) => !e.built && state.anger[e.group] >= e.threshold - EPS);
}
