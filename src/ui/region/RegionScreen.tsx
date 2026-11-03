/**
 * Full-window region screen (phase 13). Opens when a region is clicked; the game is paused while it is
 * open (store.effectivePaused). Shows traits, the regional coalition, the history of regional support
 * with what changed it, and socio-demographic data with sources.
 */
import { useEffect, useMemo, useState } from 'react';
import { config } from '@/config';
import { traitFactors } from '@core/regions';
import type { LogEntry } from '@core/types';
import { DEMOGRAPHIC_FIELDS } from '@core/types';
import { fmt, fmtSigned, t } from '@i18n/index';
import { historyTitle } from '../panel/SidePanel';
import { getStore, useStore } from '../store';
import { markerShape, RegionChart, type ChartMarker } from './RegionChart';
import { RegionDemands } from './RegionDemands';

type Tab = 'overview' | 'history' | 'data';
const FILTERS = ['all', 'policy', 'compromise', 'demand', 'chaos', 'other'] as const;
type Filter = (typeof FILTERS)[number];

/** Source type of a log entry for the history list and chart markers. */
export function sourceKind(type: string): Exclude<Filter, 'all'> {
  if (type === 'policy_picked') return 'policy';
  if (type === 'compromise_made') return 'compromise';
  if (type.startsWith('demand_') || type.startsWith('pledge_')) return 'demand';
  if (type === 'chaos_fired' || type === 'event_response') return 'chaos';
  return 'other';
}

export function RegionScreen() {
  const store = getStore();
  const code = useStore((s) => s.ui.selectedRegion);
  const regions = store.data?.regions.regions ?? [];
  // closing goes back in history when we pushed an entry, so the device back gesture and the button agree
  const close = () => {
    if ((history.state as { budgetIncRegion?: boolean } | null)?.budgetIncRegion) history.back();
    else store.setUi({ selectedRegion: null });
  };
  const step = (d: number) => {
    const i = regions.findIndex((r) => r.code === code);
    store.setUi({ selectedRegion: regions[(i + d + regions.length) % regions.length].code });
  };

  // Esc closes, arrows switch region; the device back gesture closes too
  useEffect(() => {
    if (!code) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft' && !(e.target instanceof HTMLInputElement)) step(-1);
      else if (e.key === 'ArrowRight' && !(e.target instanceof HTMLInputElement)) step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const open = code !== null;
  useEffect(() => {
    if (!open) return;
    if (!(history.state as { budgetIncRegion?: boolean } | null)?.budgetIncRegion) history.pushState({ budgetIncRegion: true }, '');
    const onPop = () => getStore().setUi({ selectedRegion: null });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open]);

  if (!code || !store.sim) return null;
  return <RegionScreenBody key={code} code={code} onClose={close} onStep={step} />;
}

function RegionScreenBody({ code, onClose, onStep }: { code: string; onClose: () => void; onStep: (d: number) => void }) {
  const store = getStore();
  const sim = store.sim!;
  const data = store.data!;
  const region = data.regions.regions.find((r) => r.code === code)!;
  const profile = data.regionProfiles.regions[code];
  const support = useStore((s) => s.sim?.state.projection.regionSupport[code] ?? 0);
  const logLen = useStore((s) => s.sim?.state.log.length ?? 0);
  const histLen = useStore((s) => s.sim?.state.regionHistory.length ?? 0);
  const [tab, setTab] = useState<Tab>('overview');
  const [filter, setFilter] = useState<Filter>('all');
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const totalSeats = data.regions.regions.reduce((a, r) => a + r.seats, 0);

  const effects = useMemo(() => {
    void logLen;
    return sim.state.log
      .map((e, i) => ({ e, i, d: e.deltas?.regions?.[code] ?? 0 }))
      .filter((x) => Math.abs(x.d) >= 0.05)
      .map((x) => ({ key: `e${x.i}`, entry: x.e, delta: x.d, kind: sourceKind(x.e.type) }));
  }, [sim, code, logLen]);
  const points = useMemo(() => {
    void histLen;
    return sim.state.regionHistory.map((h) => ({ absDay: h.absDay, v: h.s[code] ?? 0, national: h.national }));
  }, [sim, code, histLen]);

  const markers: ChartMarker[] = effects.map((f) => ({ key: f.key, absDay: f.entry.absDay, kind: f.kind, label: nameOf(f.entry), delta: f.delta }));
  const shown = effects.filter((f) => filter === 'all' || f.kind === filter).reverse();
  const total = effects.reduce((a, f) => a + f.delta, 0);
  const best = effects.reduce<(typeof effects)[number] | null>((b, f) => (f.delta > 0 && (!b || f.delta > b.delta) ? f : b), null);
  const worst = effects.reduce<(typeof effects)[number] | null>((b, f) => (f.delta < 0 && (!b || f.delta < b.delta) ? f : b), null);

  return (
    <div className="region-screen" role="dialog" aria-modal="true" aria-labelledby="region-title" data-tab={tab}>
      <header className="rs-head">
        <button className="btn btn--ghost rs-head__nav" onClick={() => onStep(-1)} aria-label={t('region.screen.prev')}>
          {'◀'}
        </button>
        <div className="rs-head__main">
          <h2 id="region-title" className="h-display">
            {t(region.name)}
          </h2>
          <p className="rs-head__stats">
            <span>
              {t('region.screen.support')} <b>{fmt(support)} %</b>
            </span>
            <span>
              {t('region.screen.seats')} <b>{region.seats}</b> ({fmt((region.seats / totalSeats) * 100, 1)} %)
            </span>
            <span className="rs-head__paused">{t('region.screen.paused')}</span>
          </p>
        </div>
        <button className="btn btn--ghost rs-head__nav" onClick={() => onStep(1)} aria-label={t('region.screen.next')}>
          {'▶'}
        </button>
        <button className="btn btn--stamp rs-head__close" onClick={onClose} aria-label={t('region.screen.close')}>
          {'✕'}
        </button>
      </header>

      <nav className="rs-tabs" role="tablist">
        {(['overview', 'history', 'data'] as Tab[]).map((id) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`rs-tab${tab === id ? ' is-on' : ''}`} onClick={() => setTab(id)}>
            {t(`region.screen.tab.${id}`)}
          </button>
        ))}
      </nav>

      <div className="rs-body">
        <div className="rs-col rs-col--side" data-section="overview">
          <RegionDemands code={code} />

          <section className="rs-card">
            <h3 className="rs-card__title">{t('region.screen.traits')}</h3>
            <ul className="rs-traits">
              {profile.traits.map((tr) => (
                <li key={tr} className={`rs-trait rs-trait--${axisOf(tr)}`}>
                  {t(`trait.${tr}`)}
                </li>
              ))}
            </ul>
            {data.regionProfiles.traitsSource.startsWith('DRAFT') && <p className="rs-note">{t('trait.draft')}</p>}
          </section>

          <section className="rs-card">
            <h3 className="rs-card__title">{t(profile.coalition.council === 'city' ? 'region.screen.coalition.city' : 'region.screen.coalition')}</h3>
            {profile.coalition.parties.length ? (
              <ul className="rs-parties">
                {profile.coalition.parties.map((p) => (
                  <li key={p} className="rs-party">
                    {t(data.parties.find((x) => x.id === p)?.label ?? p)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rs-empty">
                {t('demo.todo')} {t('region.screen.coalition.todo')}
              </p>
            )}
            <p className="rs-source">
              {t('region.screen.source', { source: profile.coalition.source })}
              {profile.coalition.asOf ? ` · ${t('region.screen.asOf', { date: profile.coalition.asOf })}` : ''}
            </p>
          </section>
        </div>

        <div className="rs-col rs-col--main" data-section="history">
          <section className="rs-card">
            <h3 className="rs-card__title">{t('region.screen.history')}</h3>
            <RegionChart points={points} markers={markers} highlighted={highlighted} onMarker={setHighlighted} />
          </section>

          <section className="rs-card">
            <h3 className="rs-card__title">{t('region.screen.effects')}</h3>
            <p className="rs-note">{t('region.screen.effectsNote')}</p>
            {effects.length > 0 && (
              <p className="rs-summary">
                <span>{t('region.screen.total', { v: fmtSigned(total, 1) })}</span>
                {best && <span className="rs-summary__good">{t('region.screen.best', { name: nameOf(best.entry), v: fmtSigned(best.delta, 1) })}</span>}
                {worst && <span className="rs-summary__bad">{t('region.screen.worst', { name: nameOf(worst.entry), v: fmtSigned(worst.delta, 1) })}</span>}
              </p>
            )}
            <div className="rs-filters" role="group">
              {FILTERS.map((f) => (
                <button key={f} className={`rs-filter${filter === f ? ' is-on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f !== 'all' && (
                    <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
                      <path d={markerShape(f, 7, 7, 4.5)} />
                    </svg>
                  )}
                  {t(`region.screen.filter.${f}`)}
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="rs-empty">{t('region.screen.noEffects')}</p>
            ) : (
              <ol className="rs-effects">
                {shown.map((f) => (
                  <li key={f.key} className={highlighted === f.key ? 'is-on' : ''} onClick={() => setHighlighted(f.key)}>
                    <span className="rs-effects__when">Q{f.entry.quarter}</span>
                    <svg className="rs-effects__icon" viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
                      <path d={markerShape(f.kind, 7, 7, 4.5)} />
                    </svg>
                    <span className="rs-effects__name">
                      {nameOf(f.entry)}
                      <TraitNote entry={f.entry} code={code} />
                    </span>
                    <b className={`rs-effects__v rs-effects__v--${f.delta >= 0 ? 'good' : 'bad'}`}>{fmtSigned(f.delta, 1)}</b>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <section className="rs-card rs-data" data-section="data">
          <h3 className="rs-card__title">{t('region.screen.demographics')}</h3>
          <dl className="rs-stats">
            {DEMOGRAPHIC_FIELDS.map((f) => {
              const st = profile.demographics[f];
              return (
                <div key={f} className="rs-stat">
                  <dt>{t(`demo.${f}`)}</dt>
                  <dd>
                    <b title={st.value === null ? t('demo.todoNote') : undefined}>{st.value === null ? t('demo.todo') : fmt(st.value, st.value % 1 ? 1 : 0)}</b>
                    <small>{st.year ? t('region.screen.sourceYear', { source: st.source, year: st.year }) : t('region.screen.source', { source: st.source })}</small>
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      </div>
    </div>
  );
}

function nameOf(e: LogEntry): string {
  const { kind, name } = historyTitle(e);
  return name || kind;
}

const axisOf = (trait: string) =>
  config.regions.traits.settlement.includes(trait) ? 'settlement' : config.regions.traits.economy.includes(trait) ? 'economy' : 'special';

/** "Zemedelstvi x1.5" for tagged cards whose effect this region's traits amplified or softened. */
function TraitNote({ entry, code }: { entry: LogEntry; code: string }) {
  const store = getStore();
  const sim = store.sim!;
  const card = entry.type === 'policy_picked' ? sim.cardById.get(String(entry.cardId)) : entry.type === 'compromise_made' ? sim.compromiseById.get(String(entry.cardId)) : undefined;
  const factors = traitFactors(store.data!, config, code, card?.tags);
  if (!factors.length) return null;
  return (
    <span className="rs-effects__traits">
      {factors.map((f) => (
        <span key={`${f.trait}-${f.tag}`}>{t('region.screen.traitMult', { trait: t(`trait.${f.trait}`), m: fmt(f.mult, 1) })}</span>
      ))}
    </span>
  );
}
