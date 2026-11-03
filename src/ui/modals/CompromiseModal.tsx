import { Fragment, useCallback, useMemo, useState } from 'react';
import { config } from '@/config';
import { channelBlocked, channelMults, normScore, yearOf } from '@core/compromise';
import { t } from '@i18n/index';
import { MINIGAMES } from '../minigames';
import { pct } from '../format';
import { getStore, useStore } from '../store';
import { PolicyCard } from './PolicyCard';
import { RangeChips } from './RangeChips';

const STAMP_MS = 520;

type Step = { kind: 'deal' } | { kind: 'channel'; cardId: string } | { kind: 'play'; cardId: string; channelId: string } | { kind: 'result'; cardId: string; channelId: string; score: number; skipped: boolean };

/**
 * Regional compromise decision (phase 12): pick one of two deals, pick a channel to sell it, play that
 * channel's mini-game, see the result. The mini-game score scales the deal (core/compromise.ts). The
 * clock is paused while this is open.
 */
export function CompromiseModal() {
  const store = getStore();
  const offer = useStore((s) => (s.sim?.state.compromiseOffer ? [...s.sim.state.compromiseOffer] : []));
  const reduced = useStore((s) => s.ui.settings.reducedMotion);
  const [stamped, setStamped] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'deal' });
  const sim = store.sim!;

  const pickDeal = (id: string) => {
    if (stamped) return;
    if (reduced) {
      setStep({ kind: 'channel', cardId: id });
      return;
    }
    setStamped(id);
    window.setTimeout(() => {
      setStamped(null);
      setStep({ kind: 'channel', cardId: id });
    }, STAMP_MS);
  };

  const onDone = useCallback(
    (score: number) => setStep((s) => (s.kind === 'play' ? { kind: 'result', cardId: s.cardId, channelId: s.channelId, score: normScore(score), skipped: false } : s)),
    [],
  );

  const title = step.kind === 'deal' ? t('compromiseModal.title') : t(sim.compromiseById.get(step.cardId)!.title);
  return (
    <div className="modal-backdrop">
      <section className={`modal modal--compromise modal--step-${step.kind}`} role="dialog" aria-modal="true" aria-labelledby="compromise-title">
        <header className="modal__head">
          <div>
            <h2 id="compromise-title" className="h-display">
              {title}
            </h2>
            <p className="modal__sub">{t(`compromiseModal.sub.${step.kind}`)}</p>
          </div>
        </header>

        {step.kind === 'deal' && (
          <div className="versus">
            {offer.map((id, i) => (
              <Fragment key={id}>
                {i > 0 && (
                  <span className="versus__or" aria-hidden="true">
                    {t('compromiseModal.or')}
                  </span>
                )}
                <PolicyCard card={sim.compromiseById.get(id)!} stamped={stamped === id} onPick={() => pickDeal(id)} />
              </Fragment>
            ))}
          </div>
        )}

        {step.kind === 'channel' && (
          <ChannelPicker
            cardId={step.cardId}
            onBack={() => setStep({ kind: 'deal' })}
            onPlay={(channelId) => setStep({ kind: 'play', cardId: step.cardId, channelId })}
            onSkip={(channelId) => setStep({ kind: 'result', cardId: step.cardId, channelId, score: config.compromise.skipScore, skipped: true })}
          />
        )}

        {step.kind === 'play' && <Minigame channelId={step.channelId} onDone={onDone} />}

        {step.kind === 'result' && (
          <Result
            {...step}
            onContinue={() => store.dispatch({ kind: 'makeCompromise', cardId: step.cardId, channelId: step.channelId, score: step.score })}
          />
        )}
      </section>
    </div>
  );
}

function Minigame({ channelId, onDone }: { channelId: string; onDone: (score: number) => void }) {
  const Game = MINIGAMES[channelId];
  return <Game onDone={onDone} />;
}

function ChannelPicker({
  cardId,
  onBack,
  onPlay,
  onSkip,
}: {
  cardId: string;
  onBack: () => void;
  onPlay: (channelId: string) => void;
  onSkip: (channelId: string) => void;
}) {
  const sim = getStore().sim!;
  const channels = Object.entries(config.compromise.channels);
  return (
    <>
      <div className="channels">
        {channels.map(([id, ch]) => {
          const blocked = channelBlocked(sim, id);
          const good = sim.previewCompromise(cardId, id, 1);
          const bad = sim.previewCompromise(cardId, id, 0);
          return (
            <article key={id} className={`memo memo--channel${blocked ? ' is-blocked' : ''}`} data-channel={id}>
              <h3 className="memo__title">
                <span className="channel__icon" aria-hidden="true">
                  {t(`channel.${id}.icon`)}
                </span>{' '}
                {t(`channel.${id}.name`)}
              </h3>
              <p className="memo__desc">{t(`channel.${id}.desc`)}</p>
              {ch.oncePerYear && <p className="channel__note">{t('compromiseModal.oncePerYear')}</p>}
              <div className="channel__outcome">
                <p className="channel__label channel__label--good">{t('compromiseModal.ifGood')}</p>
                <RangeChips preview={good} compact />
              </div>
              <div className="channel__outcome">
                <p className="channel__label channel__label--bad">{t('compromiseModal.ifBad')}</p>
                <RangeChips preview={bad} compact />
              </div>
              {blocked ? (
                <p className="channel__locked">{t('compromiseModal.tourLocked', { q: yearOf(sim.state.quarter) * 4 + 1 })}</p>
              ) : (
                <div className="channel__actions">
                  <button className="btn btn--compromise memo__pick" onClick={() => onPlay(id)}>
                    {t('compromiseModal.play')}
                  </button>
                  {ch.skippable && (
                    <button className="btn btn--ghost channel__skip" onClick={() => onSkip(id)}>
                      {t('compromiseModal.skip', { pct: Math.round(config.compromise.skipScore * 100) })}
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <button className="btn btn--ghost channel__back" onClick={onBack}>
        {t('compromiseModal.back')}
      </button>
    </>
  );
}

function Result({ cardId, channelId, score, skipped, onContinue }: { cardId: string; channelId: string; score: number; skipped: boolean; onContinue: () => void }) {
  const sim = getStore().sim!;
  const preview = useMemo(() => sim.previewCompromise(cardId, channelId, score), [sim, cardId, channelId, score]);
  const { gainMult } = channelMults(sim, channelId, score);
  const tiers = config.minigames.tiers;
  const tier = score >= tiers.great ? 'great' : score >= tiers.ok ? 'ok' : 'bad';
  const tour = config.compromise.channels[channelId].oncePerYear;
  return (
    <div className={`mg-result mg-result--${tier}`}>
      <p className="mg-result__tier">{t(skipped ? 'minigame.result.skipped' : `minigame.result.${tier}`)}</p>
      <p className="mg-result__score">{t('minigame.result.score', { pct: pct(score) })}</p>
      {tour && <p className="mg-result__tour">{t(gainMult >= 1 ? 'minigame.result.tourHelped' : gainMult > 0 ? 'minigame.result.tourWeak' : 'minigame.result.tourHurt')}</p>}
      <div className="memo memo--compromise mg-result__memo">
        <RangeChips preview={preview} all />
      </div>
      <button className="btn btn--compromise mg-result__go" onClick={onContinue} autoFocus>
        {t('minigame.result.continue')}
      </button>
    </div>
  );
}
