/**
 * Cheat codes (config.cheats): a code typed into the pause menu's window gives its reward. A cheat is an
 * ordinary input, so a run with one still replays; a run that used one is not recorded as a best score.
 */
import type { Config } from '../config';
import type { GameState } from './types';

/** Codes ignore case and surrounding spaces. */
export const normalizeCheat = (code: string) => code.trim().toUpperCase();

export function cheatReward(cfg: Config, code: string): { pc: number } | undefined {
  const key = normalizeCheat(code);
  return Object.hasOwn(cfg.cheats.codes, key) ? cfg.cheats.codes[key] : undefined;
}

export const usedCheats = (state: Pick<GameState, 'inputs'>) => state.inputs.some((rec) => rec.input.kind === 'cheat');
