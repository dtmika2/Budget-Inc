/** Mini-game B, TV debata: tap when the swinging needle is in the green "sound bite" zone. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { config } from '@/config';
import { t } from '@i18n/index';
import { getStore } from '../store';
import { MinigameFrame, useCountdown, useFrameClock, type MinigameProps } from './common';

interface Round {
  question: string;
  center: number;
  width: number;
  period: number;
}

export function TvDebate({ onDone }: MinigameProps) {
  const cfg = config.minigames.debate;
  const texts = getStore().data!.minigames;
  const rounds = useMemo<Round[]>(() => {
    const qs = [...texts.debateQuestions].sort(() => Math.random() - 0.5);
    return Array.from({ length: cfg.questions }, (_, i) => {
      const width = Math.max(0.06, cfg.zoneStart - cfg.zoneShrink * i);
      return {
        question: t(qs[i % qs.length]),
        width,
        center: width / 2 + cfg.edge + Math.random() * (1 - width - 2 * cfg.edge),
        period: Math.max(500, cfg.periodMsStart - cfg.periodMsShrink * i),
      };
    });
  }, [cfg, texts]);
  const countdown = useCountdown();
  const playing = countdown <= 0;
  const [now, elapsed] = useFrameClock(playing);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<number | null>(null);
  const [roundStart, setRoundStart] = useState(0);
  const done = useRef(false);

  const round = rounds[Math.min(idx, rounds.length - 1)];
  const tRound = now - roundStart;
  const pos = (1 - Math.cos((2 * Math.PI * tRound) / round.period)) / 2;

  const finishRound = (value: number) => {
    if (feedback !== null || done.current) return;
    setFeedback(value);
    window.setTimeout(() => {
      const next = [...results, value];
      setResults(next);
      setFeedback(null);
      if (next.length >= rounds.length) {
        done.current = true;
        onDone(next.reduce((a, b) => a + b, 0) / next.length);
      } else {
        setIdx(next.length);
        setRoundStart(elapsed());
      }
    }, cfg.feedbackMs);
  };

  // a round that runs out of time scores 0
  useEffect(() => {
    if (playing && feedback === null && !done.current && tRound > cfg.timeoutMs) finishRound(0);
  });

  const tap = () => {
    if (!playing || feedback !== null) return;
    const d = Math.abs(pos - round.center);
    finishRound(d <= round.width / 2 ? 1 : d <= round.width / 2 + cfg.edge ? 0.5 : 0);
  };

  const progress = (results.length + Math.min(1, tRound / cfg.timeoutMs)) / rounds.length;
  return (
    <MinigameFrame title={t('channel.debate.name')} instructions={t('minigame.debate.help')} countdown={countdown} progress={progress}>
      <div className="mg-debate" onPointerDown={(e) => (e.preventDefault(), tap())}>
        <p className="mg-debate__q">
          <span className="mg-debate__n">
            {Math.min(idx + 1, rounds.length)}/{rounds.length}
          </span>{' '}
          {round.question}
        </p>
        <div className="mg-debate__meter" aria-hidden="true">
          <span
            className="mg-debate__edge"
            style={{ left: `${(round.center - round.width / 2 - cfg.edge) * 100}%`, width: `${(round.width + 2 * cfg.edge) * 100}%` }}
          />
          <span className="mg-debate__zone" style={{ left: `${(round.center - round.width / 2) * 100}%`, width: `${round.width * 100}%` }} />
          <span className="mg-debate__needle" style={{ left: `${pos * 100}%` }} />
        </div>
        <button className="btn btn--stamp mg-debate__btn" tabIndex={0} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && tap()}>
          {t('minigame.now')}
        </button>
        {feedback !== null && (
          <span className={`mg-flash mg-flash--${feedback === 1 ? 'good' : feedback === 0.5 ? 'ok' : 'bad'}`} aria-live="polite">
            {t(feedback === 1 ? 'minigame.debate.hit' : feedback === 0.5 ? 'minigame.debate.close' : 'minigame.debate.miss')}
          </span>
        )}
      </div>
    </MinigameFrame>
  );
}
