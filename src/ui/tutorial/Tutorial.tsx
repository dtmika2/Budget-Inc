/**
 * First-run coach marks (spec §12.3): 6 skippable steps in Q1 — draft, top bar, map + projection,
 * side panel, first opportunity pin, upgrade tree. The clock is paused while a mark is shown. Texts are
 * locale keys ([TODO] bodies until written). The target element is highlighted via data attributes.
 */
import { useEffect } from 'react';
import { t } from '@i18n/index';
import { getStore, TUTORIAL_STEPS, useStore } from '../store';

export function Tutorial() {
  const store = getStore();
  const step = useStore((s) => s.ui.tutorial);
  const remaining = useStore((s) => s.ui.tutorialQueue.length);

  useEffect(() => {
    if (step) document.body.dataset.tut = step;
    else delete document.body.dataset.tut;
    if (step === 'panel' && store.ui.isMobile) store.setUi({ drawerOpen: true });
    return () => {
      delete document.body.dataset.tut;
    };
  }, [step, store]);

  if (!step) return null;
  const n = TUTORIAL_STEPS.indexOf(step) + 1;
  const last = remaining === 0;
  return (
    <div className={`coach coach--${step}`} role="dialog" aria-live="polite" aria-labelledby="coach-title">
      <p className="coach__step">{t('tutorial.step', { n, total: TUTORIAL_STEPS.length })}</p>
      <h3 id="coach-title">{t(`tutorial.${step}.title`)}</h3>
      <p>{t(`tutorial.${step}.body`)}</p>
      <div className="coach__actions">
        <button className="btn btn--small" onClick={() => store.tutorialSkip()}>
          {t('tutorial.skip')}
        </button>
        <button
          className="btn btn--stamp btn--small"
          autoFocus
          onClick={() => {
            if (step === 'panel' && store.ui.isMobile) store.setUi({ drawerOpen: false });
            store.tutorialNext();
          }}
        >
          {last ? t('tutorial.done') : t('tutorial.next')}
        </button>
      </div>
    </div>
  );
}
