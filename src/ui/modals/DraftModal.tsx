import { useState } from 'react';
import { t } from '@i18n/index';
import { getStore, useStore } from '../store';
import { DraftStatus } from './DraftStatus';
import { PolicyCard } from './PolicyCard';

const STAMP_MS = 520;

/** Quarterly draft (spec §6.1): 3 memos, reroll with escalating cost, must pick one. */
export function DraftModal() {
  const store = getStore();
  const hand = useStore((s) => (s.sim?.state.draft ? [...s.sim.state.draft.hand] : []));
  const quarter = useStore((s) => s.sim?.state.quarter ?? 1);
  const pc = useStore((s) => s.sim?.state.pc ?? 0);
  const cost = useStore((s) => s.sim?.currentRerollCost() ?? 0);
  const reduced = useStore((s) => s.ui.settings.reducedMotion);
  const [stamped, setStamped] = useState<string | null>(null);
  const sim = store.sim!;

  const pick = (id: string) => {
    if (stamped) return;
    if (reduced) {
      store.dispatch({ kind: 'pickPolicy', cardId: id });
      return;
    }
    setStamped(id);
    window.setTimeout(() => {
      setStamped(null);
      store.dispatch({ kind: 'pickPolicy', cardId: id });
    }, STAMP_MS);
  };

  return (
    <div className="modal-backdrop">
      <section className="modal modal--draft" role="dialog" aria-modal="true" aria-labelledby="draft-title" data-tut-target="draft">
        <header className="modal__head">
          <div>
            <h2 id="draft-title" className="h-display">
              {t('draft.title')}
            </h2>
            <p className="modal__sub">{t('draft.subtitle', { q: quarter })}</p>
          </div>
          <button className="btn btn--reroll" onClick={() => store.dispatch({ kind: 'reroll' })} disabled={pc < cost || !!stamped}>
            {t('draft.reroll')} <span className="cost">{t('draft.rerollCost', { n: cost })}</span>
          </button>
        </header>
        <DraftStatus />
        <div className="carousel">
          {hand.map((id) => (
            <PolicyCard key={id} card={sim.cardById.get(id)!} stamped={stamped === id} onPick={() => pick(id)} />
          ))}
        </div>
        <p className="carousel__hint">{t('draft.swipeHint')}</p>
      </section>
    </div>
  );
}
