import { config } from '@/config';
import { requestMet, violations, type Sliders } from '@core/budgetVote';
import { pledgesForBudget } from '@core/demands';
import type { Simulation } from '@core/simulation';
import type { CoalitionRequest } from '@core/types';
import { fmtSigned, t } from '@i18n/index';
import { areaName, Chip } from './adviceText';

/**
 * Middle column tab (P30): what the coalition partners want from this budget. Each request shows whether the
 * sliders meet it and what it does to the pass chance; the hovered step (`next`) shows as "po kroku".
 * Red lines and the player's own pledges are listed below.
 */
export function CoalitionTab({ sim, sliders, next }: { sim: Simulation; sliders: Sliders; next: Sliders | null }) {
  const reqs = sim.state.budgetVoteRequests ?? [];
  const c = config.budgetVote.requests;
  const parties = [...new Set(reqs.map((r) => r.party))];
  const redLines = sim.state.budgetVoteRedLines ?? [];
  const crossed = new Set(violations(sim, sliders).map((r) => r.item));
  const crossedNext = next ? new Set(violations(sim, next).map((r) => r.item)) : null;
  const pledges = pledgesForBudget(sim);
  const { stepPct } = config.budgetVote.sliders;
  const row = (r: CoalitionRequest) => {
    const met = requestMet(r, sliders);
    const metNext = next ? requestMet(r, next) : null;
    return (
      <li key={`${r.party}-${r.item}`} className={`bcoal__req ${met ? 'is-met' : 'is-miss'}`}>
        <span className="bcoal__what">
          <b>{areaName(sim, r.item)}</b> {t(r.dir > 0 ? 'budgetVote.req.raise' : 'budgetVote.req.cut')}
        </span>
        <Chip text={t(met ? 'budgetVote.req.met' : 'budgetVote.req.miss', { v: fmtSigned(Math.round((met ? c.metBonus : -c.missPenalty) * 100)) })} tone={met ? 'good' : 'bad'} />
        {metNext !== null && metNext !== met && <span className="bcoal__next">{t(metNext ? 'budgetVote.req.nextMet' : 'budgetVote.req.nextMiss')}</span>}
      </li>
    );
  };
  return (
    <div className="bcoal">
      <p className="bcoal__lead">{t('budgetVote.req.lead', { met: c.metBonus * 100, miss: c.missPenalty * 100 })}</p>
      {parties.length === 0 && <p className="bcoal__none">{t('budgetVote.req.none')}</p>}
      {parties.map((p) => (
        <section key={p} className="bcoal__party">
          <h4 className="bcoal__name">{t(`party.${p}`)}</h4>
          <ul className="bcoal__list">{reqs.filter((r) => r.party === p).map(row)}</ul>
        </section>
      ))}
      {(redLines.length > 0 || pledges.length > 0) && (
        <section className="bcoal__party bcoal__party--lines">
          <h4 className="bcoal__name">{t('budgetVote.req.linesHead')}</h4>
          <ul className="bcoal__list">
            {redLines.map((r) => (
              <li key={`rl-${r.item}`} className={`bcoal__req ${crossed.has(r.item) ? 'is-miss' : 'is-met'}`}>
                <span className="bcoal__what">{t('budgetVote.chamber.redLine', { area: areaName(sim, r.item), pct: r.maxCutSteps * stepPct })}</span>
                {crossed.has(r.item) && <Chip text={t('budgetVote.req.crossed', { v: fmtSigned(-Math.round(config.budgetVote.redLines.passPenalty * 100)) })} tone="bad" />}
                {crossedNext && crossedNext.has(r.item) !== crossed.has(r.item) && (
                  <span className="bcoal__next">{t(crossedNext.has(r.item) ? 'budgetVote.req.nextCrossed' : 'budgetVote.req.nextFixed')}</span>
                )}
              </li>
            ))}
            {pledges.map((p, i) => (
              <li key={`pl-${i}`} className="bcoal__req">
                <span className="bcoal__what">{t('budgetVote.chamber.pledge', { area: areaName(sim, p.item), region: t(`region.short.${p.pledge.region}`) })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
