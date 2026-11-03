import { t } from '@i18n/index';
import { REGION_PATHS, MAP_HEIGHT, MAP_WIDTH } from '../map/regionsPath';
import { getStore } from '../store';

export function MainMenu() {
  const store = getStore();
  const mock = store.data?.budget.source === 'MOCK DATA';
  return (
    <main className="screen menu">
      <svg className="menu__map" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} aria-hidden="true">
        {REGION_PATHS.map((r) => (
          <path key={r.code} d={r.d} />
        ))}
      </svg>
      <div className="menu__body">
        <h1 className="menu__title">{t('app.title')}</h1>
        <p className="menu__tagline">{t('app.tagline')}</p>
        <nav className="menu__nav">
          <button className="btn btn--stamp btn--big" onClick={() => store.go('select')}>
            {t('menu.newGame')}
          </button>
          <button className="btn" onClick={() => store.go('howto')}>
            {t('menu.howToPlay')}
          </button>
          <button className="btn" onClick={() => store.go('settings')}>
            {t('menu.settings')}
          </button>
        </nav>
        {mock && <p className="menu__mock">{t('menu.mockNotice')}</p>}
      </div>
    </main>
  );
}
