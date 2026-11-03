/** Mini-game A, Tiskova zprava: tap the spin words, avoid the gaffe words. */
import { useEffect, useRef, useState } from 'react';
import { config } from '@/config';
import { t } from '@i18n/index';
import { getStore } from '../store';
import { clamp01, MinigameFrame, pickRandom, useCountdown, useFrameClock, type MinigameProps } from './common';

interface Word {
  id: number;
  col: number;
  good: boolean;
  text: string;
  born: number;
  dur: number;
}

const COLS = 3;

export function PressRelease({ onDone }: MinigameProps) {
  const cfg = config.minigames.press;
  const texts = getStore().data!.minigames;
  const countdown = useCountdown();
  const playing = countdown <= 0;
  const [now] = useFrameClock(playing);
  const [words, setWords] = useState<Word[]>([]);
  const [flash, setFlash] = useState<{ id: number; good: boolean } | null>(null);
  const stats = useRef({ shown: 0, hits: 0, gaffes: 0, seq: 0, lastSpawn: -Infinity, done: false });

  useEffect(() => {
    if (!playing || stats.current.done) return;
    const st = stats.current;
    if (now >= cfg.durationMs) {
      st.done = true;
      onDone(clamp01((st.hits - cfg.gaffePenalty * st.gaffes) / Math.max(1, st.shown)));
      return;
    }
    // spawn outside the state updater (updaters must stay pure); stop early enough to catch the last word
    let spawned: Word | null = null;
    if (now - st.lastSpawn >= cfg.spawnMs && now < cfg.durationMs - 1200) {
      st.lastSpawn = now;
      const good = Math.random() < cfg.spinShare;
      if (good) st.shown++;
      const k = now / cfg.durationMs;
      spawned = {
        id: ++st.seq,
        col: Math.floor(Math.random() * COLS),
        good,
        text: t(pickRandom(good ? texts.pressSpin : texts.pressGaffe)),
        born: now,
        dur: cfg.fallMsStart + (cfg.fallMsEnd - cfg.fallMsStart) * k,
      };
    }
    const add = spawned;
    setWords((ws) => {
      const alive = ws.some((x) => now - x.born > x.dur) ? ws.filter((x) => now - x.born <= x.dur) : ws;
      return add ? [...alive, add] : alive;
    });
  }, [now, playing, cfg, texts, onDone]);

  const tap = (w: Word) => {
    const st = stats.current;
    if (st.done) return;
    if (w.good) st.hits++;
    else st.gaffes++;
    setFlash({ id: w.id, good: w.good });
    setWords((ws) => ws.filter((x) => x.id !== w.id));
  };

  return (
    <MinigameFrame title={t('channel.press.name')} instructions={t('minigame.press.help')} countdown={countdown} progress={now / cfg.durationMs}>
      <div className="mg-press">
        {words.map((w) => (
          <button
            key={w.id}
            className="mg-press__word"
            style={{ left: `${(w.col / COLS) * 100}%`, top: `${((now - w.born) / w.dur) * 100}%` }}
            onPointerDown={(e) => {
              e.preventDefault();
              tap(w);
            }}
          >
            {w.text}
          </button>
        ))}
        {flash && (
          <span key={flash.id} className={`mg-flash mg-flash--${flash.good ? 'good' : 'bad'}`} aria-hidden="true">
            {flash.good ? '+1' : `−${cfg.gaffePenalty}`}
          </span>
        )}
      </div>
    </MinigameFrame>
  );
}
