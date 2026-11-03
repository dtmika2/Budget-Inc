import { templateOf } from '@core/demands';
import { t } from '@i18n/index';
import { getStore, useStore } from '../store';
import { requesterLabel } from './labels';

/** Small HUD list of active pledges with a countdown; tapping a row opens that region. */
export function PledgeTracker() {
  const store = getStore();
  const pledges = useStore((s) => (s.sim ? [...s.sim.state.pledges] : []));
  const absDay = useStore((s) => (s.sim ? s.sim.absDay : 0));
  if (!pledges.length || !store.sim) return null;
  const sim = store.sim;
  return (
    <aside className="pledge-tracker" aria-label={t('pledge.title')}>
      <p className="pledge-tracker__title">{t('pledge.title')}</p>
      <ul>
        {[...pledges]
          .sort((a, b) => a.deadlineAbsDay - b.deadlineAbsDay)
          .map((p) => {
            const left = Math.max(0, p.deadlineAbsDay - absDay);
            return (
              <li key={p.id}>
                <button className={`pledge-tracker__row${left < 91 ? ' is-urgent' : ''}`} onClick={() => store.setUi({ selectedRegion: p.region })}>
                  <span className="pledge-tracker__region">{t(`region.short.${p.region}`)}</span>
                  <span className="pledge-tracker__who">{requesterLabel(sim, p.requester)}</span>
                  <span className="pledge-tracker__left">{t('pledge.left', { n: left })}</span>
                  <span className="sr-only">{t(templateOf(sim, p.templateId).text)}</span>
                </button>
              </li>
            );
          })}
      </ul>
    </aside>
  );
}
