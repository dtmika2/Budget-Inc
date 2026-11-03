import { t } from '@i18n/index';
import { getStore } from '../store';

const KEYS = ['goal', 'resources', 'groups', 'draft', 'chaos', 'pins', 'budget', 'upgrades'];

export function HowToPlay() {
  return (
    <main className="screen screen--paper">
      <section className="paper-sheet">
        <h1 className="h-display">{t('howToPlay.title')}</h1>
        {KEYS.map((k) => (
          <p key={k}>{t(`howToPlay.${k}`)}</p>
        ))}
        <button className="btn" onClick={() => getStore().go('menu')}>
          {t('common.back')}
        </button>
      </section>
    </main>
  );
}
