/**
 * Kraj actions on the region screen (P26, regions workspace), laid out as a compass rose: the kraj's actions sit
 * on the four tips (north first, in offeredActions order, so the best trait fit is north and the always-on visit
 * west), all four the same size: the scene on both sides (mirrored on the right), text, effects, the passive the
 * action leaves in the kraj and cost between. The centre disc shows the limits (actions left this quarter,
 * one action per kraj per year). A needle on the disc turns toward the tip under the pointer and rests on the
 * action done this year. History of this kraj's actions below.
 */
import { useState } from 'react';
import { config } from '@/config';
import { canDoRegionAction, offeredActions, regionActionLimits, regionActionPcCost, regionActionTemplate } from '@core/regionActions';
import { activePassives } from '@core/regionPassives';
import type { RegionPassive } from '@core/types';
import { fmt, t } from '@i18n/index';
import { getStore, useStore } from '@ui/store';
import { ActionArt, DiscArt, NeedleArt, RoseArt, type Dir } from './actionArt';
import { Outcome } from './RegionDemands';

const DIRS: Dir[] = ['n', 'e', 's', 'w'];

/** What an action's passive does, in words (the tip and the map marker). */
export function passiveText(p: RegionPassive): string {
  if (p.type === 'weeklySupport') return t('regionAction.passive.weeklySupport', { v: fmt(p.value, 2) });
  if (p.type === 'quarterlyFinances') return t('regionAction.passive.quarterlyFinances', { v: fmt(p.value) });
  if (p.type === 'shieldLosses') return t('regionAction.passive.shieldLosses', { pct: fmt((1 - p.value) * 100) });
  return t(`regionAction.passive.${p.type}`);
}
const yearOf = (quarter: number) => Math.ceil(quarter / 4);

export function RegionActions({ code }: { code: string }) {
  const store = getStore();
  const sim = store.sim!;
  // re-render on PC changes and on every action (log length)
  const pc = useStore((s) => s.sim?.state.pc ?? 0);
  const done = useStore((s) => s.sim?.state.regionActionsDone.length ?? 0);
  void pc;
  void done;
  const actions = offeredActions(sim, code).slice(0, DIRS.length);
  const lim = regionActionLimits(sim, code);
  const per = config.regionActions.perQuarter;
  const left = Math.max(0, per - lim.thisQuarter);
  const year = yearOf(sim.state.quarter);
  const doneThisYear = new Set(sim.state.regionActionsDone.filter((d) => d.region === code && yearOf(d.quarter) === year).map((d) => d.actionId));
  const doneIdx = actions.findIndex((a) => doneThisYear.has(a.id));
  const history = sim.state.regionActionsDone.filter((d) => d.region === code).reverse();
  const passivesHere = activePassives(sim, code);

  // the needle turns the short way round (its angle accumulates), toward the aimed tip or the done one
  const [aim, setAim] = useState<number | null>(null);
  const [deg, setDeg] = useState(() => Math.max(0, doneIdx) * 90);
  const point = (i: number | null) => {
    setAim(i);
    const target = (i ?? Math.max(0, doneIdx)) * 90;
    setDeg((d) => d + ((((target - d) % 360) + 540) % 360) - 180);
  };
  const lit = aim ?? (doneIdx >= 0 ? doneIdx : null);

  return (
    <div className="rs-body rs-body--actions">
      <div className={`cmp${lim.krajUsedThisYear ? ' is-used' : ''}`}>
        {DIRS.map((dir, i) => {
          const a = actions[i];
          if (!a)
            return (
              <div key={dir} className={`cmp__tip cmp__tip--${dir} cmp__tip--empty`}>
                {t('regionAction.compass.empty')}
              </div>
            );
          const reason = canDoRegionAction(sim, code, a.id);
          const pcCost = regionActionPcCost(a);
          const isDone = doneThisYear.has(a.id);
          const until = passivesHere.filter((p) => p.actionId === a.id).at(-1)?.untilQuarter ?? null;
          return (
            <section
              key={a.id}
              className={`cmp__tip cmp__tip--${dir}${isDone ? ' is-done' : reason ? ' is-locked' : ''}${aim === i ? ' is-aimed' : ''}`}
              aria-labelledby={`ra-${a.id}`}
              onPointerEnter={() => point(i)}
              onPointerLeave={() => point(null)}
              onFocus={() => point(i)}
              onBlur={() => point(null)}
            >
              <div className="cmp__art">
                <ActionArt id={a.id} />
              </div>
              <div className="cmp__body">
                <h3 id={`ra-${a.id}`} className="cmp__title">
                  {t(a.title)}
                </h3>
                <p className="cmp__text">{t(a.text)}</p>
                <Outcome label={t('regionAction.effects')} preview={sim.previewRegionAction(a.id, code)} tone="good" />
                {a.passive && (
                  <p className={`cmp__passive${until !== null ? ' is-active' : ''}`}>
                    <b>{t('regionAction.passive.label', { n: config.regionActions.passiveQuarters })}</b> {passiveText(a.passive)}
                    {until !== null && <em>{t('regionAction.passive.active', { q: until })}</em>}
                  </p>
                )}
                <div className="cmp__foot">
                  <button className="btn btn--compromise" disabled={reason !== null} onClick={() => store.dispatch({ kind: 'regionAction', region: code, actionId: a.id })}>
                    {t('regionAction.do')}
                    {pcCost > 0 && ` (${t('common.pc', { n: pcCost })})`}
                  </button>
                  {reason === 'cannot afford action' && <span className="rs-note">{t('regionAction.noPc')}</span>}
                </div>
              </div>
              <div className="cmp__art cmp__art--mirror">
                <ActionArt id={a.id} />
              </div>
              {isDone && (
                <span className="cmp__stamp" role="status">
                  {t('regionAction.doneStamp')}
                </span>
              )}
            </section>
          );
        })}

        <div className="cmp__hub" title={lim.krajUsedThisYear ? t('regionAction.usedThisYear') : t('regionAction.limits', { left, per })}>
          <RoseArt lit={lit === null ? null : DIRS[lit]} className="cmp__rose" />
          <DiscArt className="cmp__disc" />
          <span className="cmp__needle" style={{ transform: `rotate(${deg}deg)` }} aria-hidden="true">
            <NeedleArt />
          </span>
          <div className="cmp__limit" aria-live="polite">
            {lim.krajUsedThisYear ? (
              <>
                <b className="cmp__used">{t('regionAction.compass.usedYear')}</b>
                <span className="cmp__small">{t('regionAction.compass.usedNext')}</span>
              </>
            ) : (
              <>
                <span className="cmp__small">{t('regionAction.compass.quarter')}</span>
                <b className={`cmp__count${left === 0 ? ' is-zero' : ''}`}>
                  {left}
                  <small>/{per}</small>
                </b>
                <span className="cmp__small">{t('regionAction.compass.year', { n: config.regionActions.perKrajPerYear })}</span>
              </>
            )}
          </div>
        </div>
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
