/**
 * Full-window region screen (phase 13, regions workspace). Opens when a region is clicked; the game is
 * paused while it is open (store.effectivePaused). Tabs: Hlavni (interest-group cohorts, support and
 * resource charts, the events with the biggest impact), Udalosti (open region events, demands and
 * pledges with their choices, past events) and Data (traits, regional coalition, demographics).
 */
import { useEffect, useMemo, useState } from 'react';
import { config } from '@/config';
import { regionEventTemplate } from '@core/regionEvents';
import { regionCohorts, traitFactors } from '@core/regions';
import type { LogEntry, TrendPoint } from '@core/types';
import { DEMOGRAPHIC_FIELDS, RESOURCE_IDS } from '@core/types';
import { fmt, fmtSigned, t } from '@i18n/index';
import { quarterOf, TrendChart, type Series } from '@ui/charts/TrendChart';
import { RESOURCE_COLOR } from '@ui/colors';
import { historyTitle } from '@ui/panel/SidePanel';
import { DeltaList } from '@ui/popups/DeltaList';
import { getStore, useStore, type RegionTab } from '@ui/store';
import { markerShape, RegionChart, type ChartMarker } from './RegionChart';
import { RegionActions } from './RegionActions';
import { RegionDemands } from './RegionDemands';
import { RegionEventHistory, RegionEvents } from './RegionEvents';

const TABS: RegionTab[] = ['main', 'actions', 'events', 'data'];
const RESOURCE_SERIES: Series[] = RESOURCE_IDS.map((id) => ({ id, label: '', color: RESOURCE_COLOR[id], get: (p: TrendPoint) => p.resources[id] }));

/** Source type of a log entry for the impact list and chart markers. */
export function sourceKind(type: string): 'policy' | 'compromise' | 'demand' | 'chaos' | 'other' {
  if (type === 'policy_picked') return 'policy';
  if (type === 'compromise_made') return 'compromise';
  if (type.startsWith('demand_') || type.startsWith('pledge_')) return 'demand';
  if (type === 'chaos_fired' || type === 'event_response' || type.startsWith('region_event_')) return 'chaos';
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
  const data = store.data!;
  const region = data.regions.regions.find((r) => r.code === code)!;
  const support = useStore((s) => s.sim?.state.projection.regionSupport[code] ?? 0);
  const tab = useStore((s) => s.ui.regionTab);
  const openHere = useStore((s) =>
    s.sim ? s.sim.state.regionEvents.filter((e) => e.region === code).length + s.sim.state.demands.filter((d) => d.region === code).length : 0,
  );
  const totalSeats = data.regions.regions.reduce((a, r) => a + r.seats, 0);

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
        {TABS.map((id) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`rs-tab${tab === id ? ' is-on' : ''}`} onClick={() => store.setUi({ regionTab: id })}>
            {t(`region.screen.tab.${id}`)}
            {id === 'events' && openHere > 0 && <span className="rs-tab__badge">{openHere}</span>}
          </button>
        ))}
      </nav>

      {tab === 'main' && <MainTab code={code} support={support} />}
      {tab === 'actions' && <RegionActions code={code} />}
      {tab === 'events' && (
        <div className="rs-body rs-body--events">
          <div className="rs-col">
            <RegionEvents code={code} />
            <RegionDemands code={code} />
            {openHere === 0 && <p className="rs-card rs-empty">{t('region.screen.nothingOpen')}</p>}
          </div>
          <div className="rs-col">
            <RegionEventHistory code={code} />
          </div>
        </div>
      )}
      {tab === 'data' && <DataTab code={code} />}
    </div>
  );
}

/** Hlavni: cohorts on the left, charts on the right, the biggest-impact events below. */
function MainTab({ code, support }: { code: string; support: number }) {
  const store = getStore();
  const sim = store.sim!;
  const data = store.data!;
  const anger = useStore((s) => s.sim?.state.anger);
  const logLen = useStore((s) => s.sim?.state.log.length ?? 0);
  const histLen = useStore((s) => s.sim?.state.regionHistory.length ?? 0);
  const trend = useStore((s) => (s.sim ? s.sim.state.trend.slice() : []));
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const effects = useMemo(() => {
    void logLen;
    return sim.state.log
      .map((e, i) => {
        const d = e.deltas?.regions?.[code] ?? 0;
        // anger only counts for entries that belong to this kraj (its demands and region events)
        const angerHere = e.region === code ? Object.values(e.deltas?.anger ?? {}).reduce((a, v) => a + Math.abs(v ?? 0), 0) : 0;
        return { e, i, d, impact: Math.abs(d) + angerHere };
      })
      .filter((x) => Math.abs(x.d) >= 0.05)
      .map((x) => ({ key: `e${x.i}`, entry: x.e, delta: x.d, impact: x.impact, kind: sourceKind(x.e.type) }));
  }, [sim, code, logLen]);
  const points = useMemo(() => {
    void histLen;
    return sim.state.regionHistory.map((h) => ({ absDay: h.absDay, v: h.s[code] ?? 0, national: h.national }));
  }, [sim, code, histLen]);

  const markers: ChartMarker[] = effects.map((f) => ({ key: f.key, absDay: f.entry.absDay, kind: f.kind, label: nameOf(f.entry), delta: f.delta }));
  const top = [...effects].sort((x, y) => y.impact - x.impact).slice(0, config.regions.topEffects);
  const total = effects.reduce((a, f) => a + f.delta, 0);
  const cohorts = anger ? regionCohorts(data, config, code, anger, support) : [];
  const series = RESOURCE_SERIES.map((x) => ({ ...x, label: t(`resource.short.${x.id}`) }));
  const labelOf = (p: TrendPoint) => {
    const [, m, d] = sim.dateOf(p.absDay).split('-').map(Number);
    return t('chart.date', { q: quarterOf(p.absDay), d, m });
  };

  return (
    <div className="rs-body rs-body--main">
      <section className="rs-card rs-cohorts">
        <h3 className="rs-card__title">{t('region.screen.cohorts')}</h3>
        <p className="rs-note">{t('region.screen.cohortsNote')}</p>
        <ul className="cohorts">
          {cohorts.map((c) => (
            <li key={c.group} className="cohort">
              <span className="cohort__name">{t(`group.${c.group}`)}</span>
              <span className="cohort__bar" role="img" aria-label={t('region.screen.cohortAria', { support: c.support, neutral: c.neutral, anger: c.anger })}>
                <span className="cohort__seg cohort__seg--support" style={{ width: `${c.support}%` }} />
                <span className="cohort__seg cohort__seg--neutral" style={{ width: `${c.neutral}%` }} />
                <span className="cohort__seg cohort__seg--anger" style={{ width: `${c.anger}%` }} />
              </span>
              <span className="cohort__nums">
                <b className="cohort__v--support">{c.support}</b> / <b>{c.neutral}</b> / <b className="cohort__v--anger">{c.anger}</b>
              </span>
            </li>
          ))}
        </ul>
        <p className="cohorts__legend">
          <span className="cohort__key cohort__key--support">{t('region.screen.cohortSupport')}</span>
          <span className="cohort__key cohort__key--neutral">{t('region.screen.cohortNeutral')}</span>
          <span className="cohort__key cohort__key--anger">{t('region.screen.cohortAnger')}</span>
        </p>
      </section>

      <div className="rs-charts">
        <section className="rs-card">
          <h3 className="rs-card__title">{t('region.screen.history')}</h3>
          <RegionChart points={points} markers={markers} highlighted={highlighted} onMarker={setHighlighted} />
        </section>
        <section className="rs-card">
          <TrendChart points={trend} series={series} title={t('region.screen.resources')} labelOf={labelOf} />
        </section>
      </div>

      <section className="rs-card rs-top">
        <h3 className="rs-card__title">{t('region.screen.topEffects')}</h3>
        <p className="rs-note">{t('region.screen.effectsNote')}</p>
        {effects.length > 0 && <p className="rs-summary">{t('region.screen.total', { v: fmtSigned(total, 1) })}</p>}
        {top.length === 0 ? (
          <p className="rs-empty">{t('region.screen.noEffects')}</p>
        ) : (
          <ol className="rs-effects">
            {top.map((f) => (
              <li key={f.key} className={highlighted === f.key ? 'is-on' : ''} onClick={() => setHighlighted(f.key)}>
                <span className="rs-effects__when">Q{f.entry.quarter}</span>
                <svg className="rs-effects__icon" viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
                  <path d={markerShape(f.kind, 7, 7, 4.5)} />
                </svg>
                <span className="rs-effects__name">
                  {nameOf(f.entry)}
                  <TraitNote entry={f.entry} code={code} />
                  {f.entry.region === code && f.entry.deltas?.anger && <DeltaList deltas={{ resources: {}, anger: f.entry.deltas.anger }} />}
                </span>
                <b className={`rs-effects__v rs-effects__v--${f.delta >= 0 ? 'good' : 'bad'}`}>{fmtSigned(f.delta, 1)}</b>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** Data: traits, regional coalition and demographics. */
function DataTab({ code }: { code: string }) {
  const data = getStore().data!;
  const profile = data.regionProfiles.regions[code];
  return (
    <div className="rs-body rs-body--data">
      <div className="rs-col">
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

      <section className="rs-card rs-data">
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
  );
}

function nameOf(e: LogEntry): string {
  if (e.type.startsWith('region_event_')) return t(regionEventTemplate(getStore().sim!, String(e.templateId)).title);
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
