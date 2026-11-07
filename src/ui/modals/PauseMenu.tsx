import { t } from '@i18n/index';
import { getStore, useStore } from '../store';

/** Pause menu (spec §12.3) with confirmations for restart and main menu. */
export function PauseMenu() {
  const store = getStore();
  const modal = useStore((s) => s.ui.modal);
  if (modal === 'confirmRestart' || modal === 'confirmMenu') {
    const restart = modal === 'confirmRestart';
    return (
      <div className="modal-backdrop">
        <section className="modal modal--small" role="alertdialog" aria-modal="true">
          <p className="modal__confirm">{t(restart ? 'pause.confirmRestart' : 'pause.confirmMenu')}</p>
          <div className="modal__row">
            <button
              className="btn btn--stamp"
              onClick={() => (restart ? store.startRun(store.ui.setup.leader, store.ui.setup.difficulty) : store.go('menu'))}
            >
              {t(restart ? 'pause.restart' : 'pause.mainMenu')}
            </button>
            <button className="btn" onClick={() => store.openModal('pause')}>
              {t('common.cancel')}
            </button>
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="modal-backdrop">
      <section className="modal modal--small" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <h2 id="pause-title" className="h-display">
          {t('pause.title')}
        </h2>
        <nav className="menu__nav">
          <button className="btn btn--stamp" onClick={() => store.openModal(null)} autoFocus>
            {t('pause.resume')}
          </button>
          <button className="btn" onClick={() => store.openModal('confirmRestart')}>
            {t('pause.restart')}
          </button>
          <button className="btn" onClick={() => store.openModal('confirmMenu')}>
            {t('pause.mainMenu')}
          </button>
          <button className="btn" onClick={() => store.openModal('settings')}>
            {t('pause.settings')}
          </button>
          <button className="btn" onClick={() => store.openModal('cheats')}>
            {t('pause.cheats')}
          </button>
        </nav>
      </section>
    </div>
  );
}
