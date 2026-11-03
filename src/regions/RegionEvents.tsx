/**
 * Region events in a kraj (regions workspace): the open event card with both outcomes and the
 * Intervene / Ignore buttons, and the kraj's past events.
 */
import { interveneCost, regionEventTemplate, regionEventText } from '@core/regionEvents';
import { t } from '@i18n/index';
import { dateParts } from '@ui/demands/labels';
import { getStore, useStore } from '@ui/store';
import { Outcome } from './RegionDemands';

export function RegionEvents({ code }: { code: string }) {
  const store = getStore();
  const sim = store.sim!;
  const open = useStore((s) => (s.sim ? s.sim.state.regionEvents.filter((e) => e.region === code) : []));
  const pc = useStore((s) => s.sim?.state.pc ?? 0);
  return (
    <>
      {open.map((ev) => {
        const tpl = regionEventTemplate(sim, ev.templateId);
        const pr = sim.previewRegionEvent(ev.templateId, ev.region);
        const exp = dateParts(sim, ev.expireAbsDay);
        const cost = interveneCost(tpl);
        return (
          <section key={ev.id} className="rs-card demand rs-event" aria-labelledby={`rev-${ev.id}`}>
            <p className="demand__tag">
              <span className="demand__bang rs-event__bang" aria-hidden="true">
                !
              </span>
              {t('regionEvent.tag')}
            </p>
            <h3 id={`rev-${ev.id}`} className="demand__who">
              {t(tpl.title)}
            </h3>
            <p className="demand__text">{t(regionEventText(sim, ev))}</p>
            <div className="demand__grid">
              <Outcome label={t('regionEvent.ifIntervene')} preview={pr.intervene} tone="good" />
              <Outcome label={t('regionEvent.ifIgnore')} preview={pr.ignore} tone="bad" />
            </div>
            <p className="rs-note">{t('regionEvent.deadline', { d: exp.d, m: exp.m })}</p>
            <div className="demand__actions">
              <button className="btn btn--compromise" disabled={cost > pc} onClick={() => store.dispatch({ kind: 'interveneRegionEvent', eventId: ev.id })}>
                {t('regionEvent.intervene')}
                {cost > 0 && ` (${t('common.pc', { n: cost })})`}
              </button>
              <button className="btn btn--ghost" onClick={() => store.dispatch({ kind: 'ignoreRegionEvent', eventId: ev.id })}>
                {t('regionEvent.ignore')}
              </button>
            </div>
          </section>
        );
      })}
    </>
  );
}

/** Past region events in the kraj, newest first. */
export function RegionEventHistory({ code }: { code: string }) {
  const sim = getStore().sim!;
  const logLen = useStore((s) => s.sim?.state.log.length ?? 0);
  void logLen;
  const past = sim.state.log.filter((e) => (e.type === 'region_event_intervened' || e.type === 'region_event_ignored') && e.region === code).reverse();
  return (
    <section className="rs-card">
      <h3 className="rs-card__title">{t('regionEvent.history')}</h3>
      {past.length === 0 ? (
        <p className="rs-empty">{t('region.screen.noEffects')}</p>
      ) : (
        <ul className="pledges">
          {past.map((e, i) => {
            const tpl = regionEventTemplate(sim, String(e.templateId));
            return (
              <li key={i} className="pledge">
                <b>{t(tpl.title)}</b>
                <span className="pledge__due">
                  Q{e.quarter} · {t(e.type === 'region_event_intervened' ? 'regionEvent.wasIntervened' : e.timedOut ? 'regionEvent.wasTimedOut' : 'regionEvent.wasIgnored')}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
