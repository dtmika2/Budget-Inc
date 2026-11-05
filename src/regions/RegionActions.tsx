/**
 * Kraj actions on the region screen (P26, regions workspace): the 2-4 actions this kraj offers, each with its
 * cost and effects, and the limits (one action per kraj per year, a few per quarter).
 */
import { config } from '@/config';
import { canDoRegionAction, offeredActions, regionActionLimits, regionActionPcCost, regionActionTemplate } from '@core/regionActions';
import { t } from '@i18n/index';
import { getStore, useStore } from '@ui/store';
import { Outcome } from './RegionDemands';

export function RegionActions({ code }: { code: string }) {
  const store = getStore();
  const sim = store.sim!;
  // re-render on PC changes and on every action (log length)
  const pc = useStore((s) => s.sim?.state.pc ?? 0);
  const done = useStore((s) => s.sim?.state.regionActionsDone.length ?? 0);
  void pc;
  void done;
  const actions = offeredActions(sim, code);
  const lim = regionActionLimits(sim, code);
  const left = Math.max(0, config.regionActions.perQuarter - lim.thisQuarter);
  const history = sim.state.regionActionsDone.filter((d) => d.region === code).reverse();
  return (
    <div className="rs-body rs-body--events">
      <div className="rs-col">
        <p className="rs-card rs-note">
          {lim.krajUsedThisYear ? t('regionAction.usedThisYear') : t('regionAction.limits', { left, per: config.regionActions.perQuarter })}
        </p>
        {actions.map((a) => {
          const reason = canDoRegionAction(sim, code, a.id);
          const pcCost = regionActionPcCost(a);
          return (
            <section key={a.id} className="rs-card demand rs-action" aria-labelledby={`ra-${a.id}`}>
              <h3 id={`ra-${a.id}`} className="demand__who">
                {t(a.title)}
              </h3>
              <p className="demand__text">{t(a.text)}</p>
              <Outcome label={t('regionAction.effects')} preview={sim.previewRegionAction(a.id, code)} tone="good" />
              <div className="demand__actions">
                <button className="btn btn--compromise" disabled={reason !== null} onClick={() => store.dispatch({ kind: 'regionAction', region: code, actionId: a.id })}>
                  {t('regionAction.do')}
                  {pcCost > 0 && ` (${t('common.pc', { n: pcCost })})`}
                </button>
                {reason === 'cannot afford action' && <span className="rs-note">{t('regionAction.noPc')}</span>}
              </div>
            </section>
          );
        })}
      </div>
      <div className="rs-col">
        <section className="rs-card">
          <h3 className="rs-card__title">{t('regionAction.history')}</h3>
          {history.length === 0 ? (
            <p className="rs-empty">{t('region.screen.noEffects')}</p>
          ) : (
            <ul className="pledges">
              {history.map((d, i) => (
                <li key={i} className="pledge">
                  <b>{t(regionActionTemplate(sim, d.actionId)?.title ?? d.actionId)}</b>
                  <span className="pledge__due">Q{d.quarter}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
