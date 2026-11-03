import { t } from '@i18n/index';
import { SettingsPanel } from '../modals/Settings';
import { getStore } from '../store';

export function SettingsScreen() {
  return (
    <main className="screen screen--paper">
      <section className="paper-sheet">
        <h1 className="h-display">{t('settings.title')}</h1>
        <SettingsPanel />
        <button className="btn" onClick={() => getStore().go('menu')}>
          {t('common.back')}
        </button>
      </section>
    </main>
  );
}
