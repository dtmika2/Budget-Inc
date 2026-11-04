import { memo, useEffect, useMemo, useRef } from 'react';
import { config } from '@/config';
import type { ResourceId } from '@core/types';
import { RESOURCE_IDS } from '@core/types';
import { fmt, fmtSigned, t } from '@i18n/index';
import { historyTitle, originLabel } from '../panel/SidePanel';
import { Floaters } from '../popups/Floaters';
import { HoverCard, type HoverInfo } from '../HoverCard';
import { getStore, useStore } from '../store';
import { RESOURCE_ACCENT, ResourceIcon } from './resourceIcons';

/**
 * Top bar (spec §12.1, phase 19). A fixed one-row grid on desktop (time and controls | four resource tiles |
 * projection) with fixed-width number slots, so its height never changes with the numbers. Each resource has
 * its own icon and accent; its bar and value change colour with the value (red -> amber -> green). A tile
 * opens a detail panel under the bar (overlaid, so the layout does not move).
 */

const SEGMENTS = 20;

/** Value colour: red at 0, amber around 40, green from ~75 (one continuous scale). */
export function valueColor(v: number): string {
  const x = Math.max(0, Math.min(100, v));
  const hue = x < 75 ? (x / 75) * 120 : 120;
  return `hsl(${Math.round(hue)} 72% ${x < 20 ? 58 : 52}%)`;
}

/** Zone of a value for the label in the detail panel. */
const zoneOf = (v: number) => (v < 20 ? 'critical' : v < 40 ? 'weak' : v < 70 ? 'ok' : 'strong');

const ResourceTile = memo(function ResourceTile({ id, open, onToggle }: { id: ResourceId; open: boolean; onToggle: (id: ResourceId) => void }) {
  const value = useStore((s) => Math.round((s.sim?.state.resources[id] ?? 0) * 10) / 10);
  const week = useStore((s) => {
    const tr = s.sim?.state.trend;
    return tr && tr.length >= 2 ? Math.round((tr.at(-1)!.resources[id] - tr.at(-2)!.resources[id]) * 10) / 10 : 0;
  });
  const zero = useStore((s) => id !== 'coalition' && !!s.sim?.state.zeroPenalties[id]);
  // flash the bar when a bundle changed it (keyed by the floater, so each change replays the flash)
  const flash = useStore((s) => {
    const f = s.ui.floaters.filter((x) => x.key === `res.${id}` && Math.abs(x.value) >= config.life.flashMinDelta).at(-1);
    return f ? `${f.id}-${f.value > 0 ? 'up' : 'down'}` : '';
  });
  const filled = Math.round(value / (100 / SEGMENTS));
  const info: HoverInfo = {
    icon: <ResourceIcon id={id} size={28} />,
    title: t(`resource.${id}`),
    accent: RESOURCE_ACCENT[id],
    desc: t(`resource.desc.${id}`),
    value: fmt(value),
    valueColor: valueColor(value),
    status: t(`resource.zone.${zoneOf(value)}`),
    hint: t('hover.details'),
  };
  return (
    <HoverCard info={info} className="hc--tile">
      <button
        className={`res${zero ? ' res--zero' : ''}${open ? ' is-open' : ''}`}
        data-res={id}
        style={{ ['--res-c' as string]: valueColor(value), ['--res-accent' as string]: RESOURCE_ACCENT[id] }}
        onClick={() => onToggle(id)}
        aria-expanded={open}
        aria-label={`${t(`resource.${id}`)}: ${fmt(value)}`}
      >
        <ResourceIcon id={id} size={22} />
        <span className="res__main">
          <span className="res__label">
            <span className="res__name">{t(`resource.short.${id}`)}</span>
            <span className="res__nums">
              {week !== 0 && <span className={`res__trend res__trend--${week > 0 ? 'up' : 'down'}`}>{week > 0 ? '▲' : '▼'}</span>}
              <b className="res__value">{fmt(value)}</b>
            </span>
          </span>
          <span className="res__bar" aria-hidden="true">
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <span key={i} className={i < filled ? 'on' : ''} />
            ))}
          </span>
        </span>
        {flash && <span key={flash} className={`res__flash res__flash--${flash.endsWith('up') ? 'up' : 'down'}`} aria-hidden="true" />}
        <Floaters k={`res.${id}`} />
      </button>
    </HoverCard>
  );
});

/** Everything about one resource: value and zone, its 26-week line, what acts on it now, its last changes. */
function ResourceDetail({ id, onClose }: { id: ResourceId; onClose: () => void }) {
  const sim = getStore().sim!;
  const value = useStore((s) => s.sim?.state.resources[id] ?? 0);
  const trendLen = useStore((s) => s.sim?.state.trend.length ?? 0);
  const logLen = useStore((s) => s.sim?.state.log.length ?? 0);
  const ongoingKey = useStore((s) => (s.sim ? s.sim.state.ongoing.map((o) => o.key + o.daysLeft).join() + s.sim.state.modifiers.length : ''));
  const zero = id !== 'coalition' && sim.state.zeroPenalties[id];

  const points = useMemo(() => {
    void trendLen;
    return sim.state.trend.slice(-config.charts.tickerWeeks).map((p) => p.resources[id]);
  }, [sim, id, trendLen]);
  const acting = useMemo(() => {
    void ongoingKey;
    const out: { key: string; name: string; what: string; days: number; good: boolean }[] = [];
    for (const o of sim.state.ongoing)
      if (o.target === id)
        out.push({
          key: o.key,
          name: o.label ? t(o.label) : originLabel(o.origin),
          what: t('common.perDay', { v: fmtSigned(o.perDay, 2) }),
          days: o.daysLeft,
          good: o.perDay > 0,
        });
    for (const m of sim.state.modifiers)
      if (m.daysLeft !== undefined && m.target.startsWith(`${id}.`)) {
        const loss = m.target.endsWith('.loss');
        const good = m.type === 'multiplier' ? (loss ? m.value < 1 : m.value > 1) : loss ? m.value < 0 : m.value > 0;
        out.push({
          key: `${m.origin}|${m.target}`,
          name: originLabel(m.origin),
          what: t(`resource.mod.${m.target.slice(id.length + 1)}`, { v: m.type === 'multiplier' ? `×${fmt(m.value, 2)}` : fmtSigned(m.value) }),
          days: m.daysLeft,
          good,
        });
      }
    return out;
  }, [sim, id, ongoingKey]);
  const recent = useMemo(() => {
    void logLen;
    return sim.state.log
      .filter((e) => Math.abs(e.deltas?.resources[id] ?? 0) >= 0.05)
      .slice(-6)
      .reverse()
      .map((e) => ({ e, d: e.deltas!.resources[id]!, title: historyTitle(e) }));
  }, [sim, id, logLen]);

  const zone = zoneOf(value);
  return (
    <section
      className="res-detail"
      style={{ ['--res-c' as string]: valueColor(value), ['--res-accent' as string]: RESOURCE_ACCENT[id] }}
      aria-label={t(`resource.${id}`)}
    >
      <header className="res-detail__head">
        <ResourceIcon id={id} size={40} />
        <div className="res-detail__title">
          <h3>{t(`resource.${id}`)}</h3>
          <p>{t(`resource.desc.${id}`)}</p>
        </div>
        <div className="res-detail__value">
          <b>{fmt(value)}</b>
          <span className={`res-detail__zone res-detail__zone--${zone}`}>{t(`resource.zone.${zone}`)}</span>
        </div>
        <button className="btn-icon res-detail__close" onClick={onClose} aria-label={t('common.close')}>
          {'✕'}
        </button>
      </header>
      <div className="res-detail__body">
        <div className="res-detail__col">
          <h4>{t('resource.detail.trend')}</h4>
          <Sparkline values={points} />
          {zero && (
            <p className="res-detail__warn">
              {t(`penalty.${id}`)}: {t(`resource.${id}`)} = 0
            </p>
          )}
        </div>
        <div className="res-detail__col">
          <h4>{t('resource.detail.acting')}</h4>
          {acting.length === 0 ? (
            <p className="res-detail__empty">{t('resource.detail.nothing')}</p>
          ) : (
            <ul className="res-detail__list">
              {acting.map((a) => (
                <li key={a.key} className={a.good ? 'is-good' : 'is-bad'}>
                  <b>{a.name}</b> <span>{a.what}</span> <em>{t('common.days', { n: a.days })}</em>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="res-detail__col">
          <h4>{t('resource.detail.recent')}</h4>
          {recent.length === 0 ? (
            <p className="res-detail__empty">{t('resource.detail.nothing')}</p>
          ) : (
            <ul className="res-detail__list">
              {recent.map(({ e, d, title }, i) => (
                <li key={i} className={d > 0 ? 'is-good' : 'is-bad'}>
                  <span className="res-detail__when">Q{e.quarter}</span> <b>{title.name || title.kind}</b> <em>{fmtSigned(d, 1)}</em>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/** A small line of the last weeks on a 0-100 scale, with the 20 / 40 / 70 zone lines. */
function Sparkline({ values }: { values: number[] }) {
  const W = 240;
  const H = 64;
  if (values.length < 2) return <p className="res-detail__empty">{t('resource.detail.noTrend')}</p>;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - (Math.max(0, Math.min(100, v)) / 100) * H;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('resource.detail.trend')}>
      {[20, 40, 70].map((z) => (
        <line key={z} x1="0" x2={W} y1={y(z)} y2={y(z)} className="sparkline__zone" />
      ))}
      <path d={`${d} L${W} ${H} L0 ${H} Z`} className="sparkline__area" />
      <path d={d} className="sparkline__line" />
      <circle cx={x(values.length - 1)} cy={y(values.at(-1)!)} r="3" className="sparkline__dot" />
    </svg>
  );
}

function DateLabel() {
  // quarter and week of the quarter only
  const label = useStore((s) => (s.sim ? t('hud.dateShort', { q: s.sim.state.quarter, w: Math.ceil(s.sim.state.day / 7) }) : ''));
  return <span className="hud-date">{label}</span>;
}

function Pc() {
  const pc = useStore((s) => s.sim?.state.pc ?? 0);
  return (
    <span className="hud-pc" title={t('hud.pcLong')}>
      <span className="hud-pc__coin" aria-hidden="true" />
      <b>{pc}</b>
      <span className="hud-pc__label">{t('hud.pc')}</span>
    </span>
  );
}

/** Projection colour: 50 % (a coin flip) is amber, a sure win green, a sure loss red. */
const projectionColor = (pct: number) => valueColor(Math.max(0, Math.min(100, (pct - 25) * 1.6)));

export function ProjectionBadge({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const p = useStore((s) => s.sim?.state.projection.P ?? 0);
  const pct = Math.round(p * 100);
  const info: HoverInfo = {
    title: t('hud.projection'),
    accent: 'var(--gold)',
    desc: t('hover.projection'),
    value: `${pct} %`,
    valueColor: projectionColor(pct),
    hint: t('hover.details'),
  };
  return (
    <HoverCard info={info} className="hc--tile">
      <button
        className={`projection${open ? ' is-open' : ''}`}
        data-tut-target="map"
        style={{ ['--res-c' as string]: projectionColor(pct) }}
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${t('hud.projection')}: ${pct} %`}
      >
        <span className="projection__label">{t('hud.projection')}</span>
        <b key={pct} className="flash-num">
          {pct} %
        </b>
        <span className="projection__gauge" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
      </button>
    </HoverCard>
  );
}

/** The projection's detail: its weekly line (the map corner chart used to show it) and what drives it. */
function ProjectionDetail({ onClose }: { onClose: () => void }) {
  const sim = getStore().sim!;
  const proj = useStore((s) => s.sim?.state.projection);
  const trendLen = useStore((s) => s.sim?.state.trend.length ?? 0);
  const points = useMemo(() => {
    void trendLen;
    return sim.state.trend.slice(-config.charts.tickerWeeks).map((p) => p.P * 100);
  }, [sim, trendLen]);
  if (!proj) return null;
  const pct = Math.round(proj.P * 100);
  return (
    <section
      className="res-detail"
      style={{ ['--res-c' as string]: projectionColor(pct), ['--res-accent' as string]: 'var(--gold)' }}
      aria-label={t('hud.projection')}
    >
      <header className="res-detail__head">
        <span />
        <div className="res-detail__title">
          <h3>{t('hud.projection')}</h3>
          <p>{t('hover.projection')}</p>
        </div>
        <div className="res-detail__value">
          <b>{pct} %</b>
        </div>
        <button className="btn-icon res-detail__close" onClick={onClose} aria-label={t('common.close')}>
          {'✕'}
        </button>
      </header>
      <div className="res-detail__body">
        <div className="res-detail__col">
          <h4>{t('resource.detail.trend')}</h4>
          <Sparkline values={points} />
        </div>
        <div className="res-detail__col">
          <h4>{t('projection.detail.parts')}</h4>
          <ul className="res-detail__list">
            <li className={proj.S >= proj.T ? 'is-good' : 'is-bad'}>
              <b>{t('projection.detail.support')}</b> <em>{fmt(proj.S, 1)}</em>
            </li>
            <li>
              <b>{t('projection.detail.threshold')}</b> <em>{fmt(proj.T, 1)}</em>
            </li>
          </ul>
        </div>
        <div className="res-detail__col">
          <p className="res-detail__empty">{t('projection.detail.note')}</p>
        </div>
      </div>
    </section>
  );
}

function SpeedControls() {
  const store = getStore();
  const speed = useStore((s) => s.ui.speed);
  const paused = useStore((s) => s.ui.userPaused);
  return (
    <span className="speed" role="group">
      <button
        className={`btn-icon${paused ? ' is-on' : ''}`}
        onClick={() => store.togglePause()}
        aria-label={paused ? t('hud.play') : t('hud.pause')}
        aria-pressed={paused}
      >
        {paused ? '▶' : '❚❚'}
      </button>
      {config.time.speeds.map((n) => (
        <button
          key={n}
          className={`btn-icon${!paused && speed === n ? ' is-on' : ''}`}
          onClick={() => store.setSpeed(n)}
          aria-label={t('hud.speed', { n })}
          aria-pressed={!paused && speed === n}
        >
          {`${n}×`}
        </button>
      ))}
      <button className="btn-icon" onClick={() => store.openModal('pause')} aria-label={t('hud.menu')}>
        {'☰'}
      </button>
    </span>
  );
}

export function TopBar() {
  const store = getStore();
  const open = useStore((s) => s.ui.resourceDetail);
  const setOpen = (id: ResourceId | 'projection' | null) => store.setUi({ resourceDetail: id });
  const ref = useRef<HTMLElement>(null);
  const toggle = (id: ResourceId | 'projection') => setOpen(open === id ? null : id);
  // close the detail on Escape or a click outside the bar
  useEffect(() => {
    if (!open) return;
    const close = () => getStore().setUi({ resourceDetail: null });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    // pop-ups and panel rows open details themselves, so a click there does not close one first
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.('.popup, .erow, .hrow') && close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);
  return (
    <header className="topbar" data-tut-target="topbar" ref={ref}>
      <Pc />
      <ProjectionBadge open={open === 'projection'} onToggle={() => toggle('projection')} />
      <div className="topbar__resources">
        {RESOURCE_IDS.map((r) => (
          <ResourceTile key={r} id={r} open={open === r} onToggle={toggle} />
        ))}
      </div>
      <SpeedControls />
      <DateLabel />
      {open === 'projection' && <ProjectionDetail onClose={() => setOpen(null)} />}
      {open && open !== 'projection' && <ResourceDetail id={open} onClose={() => setOpen(null)} />}
    </header>
  );
}
