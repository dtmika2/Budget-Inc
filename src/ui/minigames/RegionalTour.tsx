/** Mini-game C, Objezd regionu: shake the hands that pop up in the crowd, don't touch eggs and tomatoes. */
import { useEffect, useRef, useState } from 'react';
import { config } from '@/config';
import { t } from '@i18n/index';
import { PixelIcon } from '../pixelIcons';
import { clamp01, MinigameFrame, useCountdown, useFrameClock, type MinigameProps } from './common';

interface Pop {
  id: number;
  cell: number;
  hand: boolean;
  /** 0 = egg, 1 = tomato (only when !hand). */
  kind: number;
  born: number;
  life: number;
}

const CELLS = 9;

export function RegionalTour({ onDone }: MinigameProps) {
  const cfg = config.minigames.tour;
  const countdown = useCountdown();
  const playing = countdown <= 0;
  const [now] = useFrameClock(playing);
  const [pops, setPops] = useState<Pop[]>([]);
  const [flash, setFlash] = useState<{ id: number; good: boolean } | null>(null);
  const st = useRef({ shown: 0, shakes: 0, hits: 0, seq: 0, lastSpawn: -Infinity, done: false });

  useEffect(() => {
    if (!playing || st.current.done) return;
    const s = st.current;
    if (now >= cfg.durationMs) {
      s.done = true;
      onDone(clamp01((s.shakes - cfg.hitPenalty * s.hits) / Math.max(1, s.shown)));
      return;
    }
    // spawn outside the state updater (updaters must stay pure)
    let spawned: Pop | null = null;
    const alive = pops.filter((p) => now - p.born <= p.life);
    if (now - s.lastSpawn >= cfg.spawnMs && now < cfg.durationMs - 600) {
      const free = Array.from({ length: CELLS }, (_, i) => i).filter((i) => !alive.some((p) => p.cell === i));
      if (free.length) {
        s.lastSpawn = now;
        const hand = Math.random() < cfg.handShare;
        if (hand) s.shown++;
        const k = now / cfg.durationMs;
        spawned = {
          id: ++s.seq,
          cell: free[Math.floor(Math.random() * free.length)],
          hand,
          kind: Math.random() < 0.5 ? 0 : 1,
          born: now,
          life: cfg.lifeMsStart + (cfg.lifeMsEnd - cfg.lifeMsStart) * k,
        };
      }
    }
    const add = spawned;
    if (add || alive.length !== pops.length) setPops((ps) => [...ps.filter((p) => now - p.born <= p.life && p.id !== add?.id), ...(add ? [add] : [])]);
  }, [now, playing, cfg, onDone, pops]);

  const tap = (p: Pop) => {
    const s = st.current;
    if (s.done) return;
    if (p.hand) s.shakes++;
    else s.hits++;
    setFlash({ id: p.id, good: p.hand });
    setPops((ps) => ps.filter((x) => x.id !== p.id));
  };

  return (
    <MinigameFrame title={t('channel.tour.name')} instructions={t('minigame.tour.help')} countdown={countdown} progress={now / cfg.durationMs}>
      <div className="mg-tour">
        {Array.from({ length: CELLS }, (_, i) => {
          const p = pops.find((x) => x.cell === i);
          return (
            <div key={i} className="mg-tour__cell">
              <span className="mg-tour__crowd" aria-hidden="true" />
              {p && (
                <button
                  className={`mg-tour__pop mg-tour__pop--${p.hand ? 'hand' : 'throw'}`}
                  aria-label={t(p.hand ? 'minigame.tour.hand' : 'minigame.tour.throw')}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    tap(p);
                  }}
                >
                  <PixelIcon name={p.hand ? 'handshake' : p.kind === 0 ? 'egg' : 'tomato'} size={40} />
                </button>
              )}
            </div>
          );
        })}
        {flash && (
          <span key={flash.id} className={`mg-flash mg-flash--${flash.good ? 'good' : 'bad'}`} aria-hidden="true">
            {flash.good ? '+1' : `−${cfg.hitPenalty}`}
          </span>
        )}
      </div>
    </MinigameFrame>
  );
}
