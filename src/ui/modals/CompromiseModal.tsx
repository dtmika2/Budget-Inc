import { Fragment, useState } from 'react';
import { t } from '@i18n/index';
import { getStore, useStore } from '../store';
import { PolicyCard } from './PolicyCard';

const STAMP_MS = 520;

/**
 * Regional compromise decision: two compromise cards against each other (never mixed with policies).
 * The player must make one of them; the clock is paused while this is open.
 */
export function CompromiseModal() {
  const store = getStore();
  const offer = useStore((s) => (s.sim?.state.compromiseOffer ? [...s.sim.state.compromiseOffer] : []));
  const reduced = useStore((s) => s.ui.settings.reducedMotion);
  const [stamped, setStamped] = useState<string | null>(null);
  const sim = store.sim!;

  const make = (id: string) => {
    if (stamped) return;
    if (reduced) {
      store.dispatch({ kind: 'makeCompromise', cardId: id });
      return;
    }
    setStamped(id);
    window.setTimeout(() => {
      setStamped(null);
      store.dispatch({ kind: 'makeCompromise', cardId: id });
    }, STAMP_MS);
  };

  return (
    <div className="modal-backdrop">
      <section className="modal modal--compromise" role="dialog" aria-modal="true" aria-labelledby="compromise-title">
        <header className="modal__head">
          <div>
            <h2 id="compromise-title" className="h-display">
              {t('compromiseModal.title')}
            </h2>
            <p className="modal__sub">{t('compromiseModal.subtitle')}</p>
          </div>
        </header>
        <div className="versus">
          {offer.map((id, i) => (
            <Fragment key={id}>
              {i > 0 && (
                <span className="versus__or" aria-hidden="true">
                  {t('compromiseModal.or')}
                </span>
              )}
              <PolicyCard card={sim.compromiseById.get(id)!} stamped={stamped === id} onPick={() => make(id)} />
            </Fragment>
          ))}
        </div>
      </section>
    </div>
  );
}
