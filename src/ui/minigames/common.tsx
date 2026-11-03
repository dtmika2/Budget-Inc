/**
 * Shared pieces of the compromise mini-games (UI only). Mini-games use real time and UI randomness; the
 * core never sees them — only the final score (0..1) is dispatched.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { config } from '@/config';
import { t } from '@i18n/index';

export interface MinigameProps {
  onDone: (score: number) => void;
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Real-time clock that re-renders every animation frame while `active`. Returns the ms since activation
 * and a stable function reading the same clock outside render (e.g. in a timeout).
 */
export function useFrameClock(active: boolean): [number, () => number] {
  const [now, setNow] = useState(0);
  const start = useRef<number | null>(null);
  const elapsed = useCallback(() => (start.current === null ? 0 : performance.now() - start.current), []);
  useEffect(() => {
    if (!active) return;
    start.current = performance.now();
    let raf = 0;
    const loop = () => {
      setNow(elapsed());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, elapsed]);
  return [now, elapsed];
}

/** 3-2-1 countdown; returns the remaining count (0 = go). */
export function useCountdown(seconds = config.minigames.countdownSec): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const id = window.setTimeout(() => setLeft((n) => n - 1), 700);
    return () => window.clearTimeout(id);
  }, [left]);
  return left;
}

/** Frame around a mini-game: title, one-line instructions, countdown overlay and a time bar. */
export function MinigameFrame({
  title,
  instructions,
  countdown,
  progress,
  children,
}: {
  title: string;
  instructions: string;
  countdown: number;
  /** 0..1 of the time used. */
  progress: number;
  children: ReactNode;
}) {
  return (
    <div className="mg">
      <div className="mg__head">
        <h3 className="mg__title">{title}</h3>
        <p className="mg__help">{instructions}</p>
      </div>
      <div className="mg__time" aria-label={t('minigame.time')}>
        <span style={{ width: `${(1 - clamp01(progress)) * 100}%` }} />
      </div>
      <div className="mg__stage">
        {children}
        {countdown > 0 && (
          <div className="mg__countdown" aria-live="assertive">
            {countdown}
          </div>
        )}
      </div>
    </div>
  );
}

export const pickRandom = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
