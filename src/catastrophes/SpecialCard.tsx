/**
 * The open special card (phase 'special'): a catastrophe drops from the top and shakes the game; an
 * agent card flips over and shines. Accept (special.accept.<kind>) evaluates the check, the card reveals the result, and
 * Continue (special.continue) lets the game run on. Rendered in a portal so it sits above everything.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { consequenceOf, specialCard } from '@core/specialCards';
import { t } from '@i18n/index';
import { DeltaList } from '@ui/popups/DeltaList';
import { RangeChips } from '@ui/modals/RangeChips';
import { PixelIcon } from '@ui/pixelIcons';
import { getStore, useStore } from '@ui/store';
import { AgentCardBack, AgentFx } from './AgentFx';
import { CatastropheFx } from './CatastropheFx';
import { CardArt } from './cardArt';
import { conditionName, conditionText, conditionValue } from './specialText';

/** Shake the game under a landing catastrophe (skipped with reduced motion). */
function useQuake(cardId: string | null, reduced: boolean) {
  useEffect(() => {
    if (!cardId || reduced || typeof document === 'undefined') return;
    const body = document.body;
    const start = window.setTimeout(() => body.setAttribute('data-quake', ''), 480);
    const stop = window.setTimeout(() => body.removeAttribute('data-quake'), 1400);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(stop);
      body.removeAttribute('data-quake');
    };
  }, [cardId, reduced]);
}

export function SpecialCard() {
  const store = getStore();
  // primitive key so the card re-renders when it opens and when it is accepted
  const key = useStore((s) => {
    const o = s.sim?.state.phase === 'special' ? s.sim.state.specials.open : null;
    return o ? `${o.id}:${o.result ? 'r' : 'o'}` : '';
  });
  const reduced = useStore((s) => s.ui.settings.reducedMotion);
  const sim = store.sim;
  const open = key && sim ? sim.state.specials.open : null;
  const card = open && sim ? specialCard(sim, open.cardId) : undefined;
  useQuake(card?.kind === 'catastrophe' && open ? open.id : null, reduced);
  if (!sim || !open || !card || typeof document === 'undefined') return null;

  const kind = card.kind;
  const result = open.result;
  const preview = sim.preview(consequenceOf(card), 'special');
  const applied = result ? (kind === 'catastrophe' ? !result.passed : result.passed) : false;
  const name = conditionName(card.condition);

  const face = (
    <div className="special-face special-face--front">
      <header className="special-card__banner">
        <span className="special-card__icon" aria-hidden="true">
          <PixelIcon name={kind === 'catastrophe' ? 'alert' : 'star'} />
        </span>
        {t(`special.kind.${kind}`)}
      </header>
      <div className="special-card__art">
        <CardArt art={card.art} kind={kind} />
      </div>
      <div className="special-card__body">
        <h2 id="special-title" className="special-card__title">
          {t(card.title)}
        </h2>
        <p className="special-card__text">{t(card.text)}</p>
        <div className="special-card__check">
          <span className="special-card__label">{t('special.check')}</span>
          <strong>{conditionText(card.condition)}</strong>
          {result && (
            <span className={`special-stamp ${result.passed ? 'special-stamp--pass' : 'special-stamp--fail'}`} role="status">
              {t(result.passed ? 'special.passed' : 'special.failed')}
            </span>
          )}
        </div>
        {!result ? (
          <>
            <div className="special-card__stakes">
              <span className="special-card__label">{t(kind === 'catastrophe' ? 'special.ifFail' : 'special.ifPass')}</span>
              <RangeChips preview={preview} compact />
            </div>
            <button className="btn btn--stamp special-card__btn" onClick={() => store.dispatch({ kind: 'acceptSpecial' })} autoFocus>
              {t(`special.accept.${kind}`)}
            </button>
          </>
        ) : (
          <>
            <p className="special-card__value">
              {t('special.value', {
                name,
                value: conditionValue(card.condition, result.value),
                need: t(`special.need.${card.condition.op}`, { v: conditionValue(card.condition, card.condition.value) }),
              })}
            </p>
            <div className="special-card__stakes">
              {applied && result.deltas ? (
                <>
                  <span className="special-card__label">{t(kind === 'catastrophe' ? 'special.sanction' : 'special.bonus')}</span>
                  <DeltaList deltas={result.deltas} />
                </>
              ) : (
                <span className="special-card__label">{t(kind === 'catastrophe' ? 'special.noSanction' : 'special.noBonus')}</span>
              )}
            </div>
            <button className="btn btn--stamp special-card__btn" onClick={() => store.dispatch({ kind: 'closeSpecial' })} autoFocus>
              {t('special.continue')}
            </button>
          </>
        )}
      </div>
      {kind === 'agent' && <span className="special-card__shine" aria-hidden="true" />}
    </div>
  );

  return createPortal(
    <div className={`special-layer special-layer--${kind}`} role="dialog" aria-modal="true" aria-labelledby="special-title">
      <div className={`special-card special-card--${kind}${result ? ' is-revealed' : ''}`} key={open.id}>
        {kind === 'catastrophe' && <CatastropheFx />}
        {kind === 'agent' && <AgentFx />}
        <div className="special-flip">
          {face}
          {kind === 'agent' && <AgentCardBack />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
