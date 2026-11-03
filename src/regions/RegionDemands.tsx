/**
 * Demands and pledges in a region (phase 14): the open "!" demand card with the impact of every choice,
 * and the region's active pledges with their deadline.
 */
import { config } from '@/config';
import { templateOf } from '@core/demands';
import { t } from '@i18n/index';
import { dateParts, requesterLabel } from '@ui/demands/labels';
import { RangeChips } from '@ui/modals/RangeChips';
import { getStore, useStore } from '@ui/store';

export function RegionDemands({ code }: { code: string }) {
  const store = getStore();
  const sim = store.sim!;
  const demands = useStore((s) => (s.sim ? s.sim.state.demands.filter((d) => d.region === code) : []));
  const pledges = useStore((s) => (s.sim ? s.sim.state.pledges.filter((p) => p.region === code) : []));
  const absDay = useStore((s) => (s.sim ? s.sim.absDay : 0));
  if (!demands.length && !pledges.length) return null;
  return (
    <>
      {demands.map((d) => {
        const tpl = templateOf(sim, d.templateId);
        const pr = sim.previewDemand(d.templateId, d.region);
        const exp = dateParts(sim, d.expireAbsDay);
        return (
          <section key={d.id} className="rs-card demand" aria-labelledby={`dem-${d.id}`}>
            <p className="demand__tag">
              <span className="demand__bang" aria-hidden="true">
                !
              </span>
              {t('demand.title')}
            </p>
            <h3 id={`dem-${d.id}`} className="demand__who">
              {requesterLabel(sim, d.requester)}
            </h3>
            <p className="demand__text">{t(tpl.text)}</p>
            {tpl.programmeRef && <p className="demand__prog">{t('demand.programme')}</p>}
            <p className="demand__deadline">{t('demand.deadline', { q: config.demands.deadlineQuarters })}</p>
            <div className="demand__how">
              <b>{t('demand.howTo')}:</b> {t(tpl.fulfilHint)}
            </div>
            <div className="demand__grid">
              <Outcome label={t('demand.ifAccept')} preview={pr.accept} tone="neutral" />
              <Outcome label={t('demand.ifFulfil')} preview={pr.fulfil} tone="good" />
              <Outcome label={t('demand.ifFail')} preview={pr.fail} tone="bad" />
              <Outcome label={t('demand.ifReject')} preview={pr.reject} tone="bad" />
            </div>
            <p className="rs-note">{t('demand.ifIgnore', { d: exp.d, m: exp.m })}</p>
            <div className="demand__actions">
              <button className="btn btn--compromise" onClick={() => store.dispatch({ kind: 'acceptDemand', demandId: d.id })}>
                {t('demand.accept')}
              </button>
              <button className="btn btn--ghost" onClick={() => store.dispatch({ kind: 'rejectDemand', demandId: d.id })}>
                {t('demand.reject')}
              </button>
            </div>
          </section>
        );
      })}
      {pledges.length > 0 && (
        <section className="rs-card">
          <h3 className="rs-card__title">{t('pledge.inRegion')}</h3>
          <ul className="pledges">
            {pledges.map((p) => {
              const tpl = templateOf(sim, p.templateId);
              const due = dateParts(sim, p.deadlineAbsDay);
              return (
                <li key={p.id} className="pledge">
                  <b>{requesterLabel(sim, p.requester)}</b>: {t(tpl.text)}
                  <span className="pledge__due">
                    {t('pledge.due', due)} · {t('pledge.left', { n: Math.max(0, p.deadlineAbsDay - absDay) })}
                  </span>
                  <span className="pledge__how">{t(tpl.fulfilHint)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

function Outcome({ label, preview, tone }: { label: string; preview: Parameters<typeof RangeChips>[0]['preview']; tone: 'good' | 'bad' | 'neutral' }) {
  const empty = !Object.keys(preview.resources).length && !Object.keys(preview.anger).length && !Object.keys(preview.regions).length;
  return (
    <div className={`demand__out demand__out--${tone}`}>
      <p className="demand__outlabel">{label}</p>
      {empty ? <p className="rs-note">—</p> : <RangeChips preview={preview} compact />}
    </div>
  );
}
