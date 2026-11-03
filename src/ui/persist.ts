/** localStorage helpers. Every access is guarded: storage may be unavailable (private mode, previews). */
import type { DifficultyId } from '@core/types';

const PREFIX = 'budgetinc.';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: settings simply do not persist */
  }
}

export interface Settings {
  defaultSpeed: number;
  reducedMotion: boolean;
}

export function loadSettings(defaultSpeed: number): Settings {
  const prefersReduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return read<Settings>('settings', { defaultSpeed, reducedMotion: prefersReduced });
}

export const saveSettings = (s: Settings) => write('settings', s);

export const tutorialSeen = () => read<boolean>('tutorialSeen', false);
export const setTutorialSeen = (v: boolean) => write('tutorialSeen', v);

/** Best score per leader and difficulty (this is not a game save). */
export function bestScore(leader: string, difficulty: DifficultyId): number | null {
  return read<number | null>(`best.${leader}.${difficulty}`, null);
}

/** Records the score if it beats the stored best; returns true for a new best. */
export function recordScore(leader: string, difficulty: DifficultyId, score: number): boolean {
  const prev = bestScore(leader, difficulty);
  if (prev === null || score > prev) {
    write(`best.${leader}.${difficulty}`, score);
    return true;
  }
  return false;
}
