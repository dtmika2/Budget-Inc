import { t } from '@i18n/index';
import { initials } from '../format';
import { LeaderSprite } from '../LeaderSprite';
import { getStore } from '../store';

/** Full-screen ending card (spec §4.5): leader art, Czech text key, continue -> final screen. */
export function EndingCard() {
  const store = getStore();
  const sim = store.sim!;
  const ending = sim.data.endings.find((e) => e.id === sim.state.endingId);
  if (!ending) return null;
  return (
    <div className="modal-backdrop modal-backdrop--solid">
      <section className="modal modal--ending" role="dialog" aria-modal="true" aria-labelledby="ending-title" data-art={ending.art}>
        <p className="ending__label">{t('ending.label')}</p>
        <div className="ending__art" aria-hidden="true">
          <LeaderSprite sprite={sim.leaderDef.sprite} color={sim.leaderDef.color} scale={8} initials={initials(sim.leaderDef)} animate={false} />
          <span className="ending__crack" />
        </div>
        <h2 id="ending-title" className="h-display">
          {t(ending.title)}
        </h2>
        <p className="ending__text">{t(ending.text)}</p>
        <button className="btn btn--stamp btn--big" onClick={() => store.finishPresentation()} autoFocus>
          {t('ending.continue')}
        </button>
      </section>
    </div>
  );
}
