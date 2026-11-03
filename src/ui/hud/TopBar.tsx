import { memo, useState } from 'react';
import { config } from '@/config';
import type { ResourceId } from '@core/types';
import { RESOURCE_IDS } from '@core/types';
import { fmt, t } from '@i18n/index';
import { dateLabel } from '../format';
import { Floaters } from '../popups/Floaters';
import { getStore, useStore } from '../store';

const SEGMENTS = 10;

const ResourceBar = memo(function ResourceBar({ id }: { id: ResourceId }) {
  const value = useStore((s) => Math.round((s.sim?.state.resources[id] ?? 0) * 10) / 10);
  const zero = useStore((s) => id !== 'coalition' && !!s.sim?.state.zeroPenalties[id]);
  const [showValue, setShowValue] = useState(false);
  // flash the bar when a bundle changed it (keyed by the floater, so each change replays the flash)
  const flash = useStore((s) => {
    const f = s.ui.floaters.filter((x) => x.key === `res.${id}` && Math.abs(x.value) >= config.life.flashMinDelta).at(-1);
    return f ? `${f.id}-${f.value > 0 ? 'up' : 'down'}` : '';
  });
  const filled = Math.ceil(value / (100 / SEGMENTS));
  const low = value < 20;
  return (
    <button
      className={`res${low ? ' res--low' : ''}${zero ? ' res--zero' : ''}`}
      data-res={id}
      onClick={() => setShowValue((v) => !v)}
      title={`${t(`resource.${id}`)}: ${fmt(value)}`}
      aria-label={`${t(`resource.${id}`)}: ${fmt(value)}`}
    >
      <span className="res__label">
        <span className="res__name res__name--long">{t(`resource.${id}`)}</span>
        <span className="res__name res__name--short">{t(`resource.short.${id}`)}</span>
        <span className={`res__value${showValue ? ' is-shown' : ''}`}>{fmt(value)}</span>
      </span>
      <span className="res__bar" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} className={i < filled ? 'on' : ''} />
        ))}
      </span>
      {flash && <span key={flash} className={`res__flash res__flash--${flash.endsWith('up') ? 'up' : 'down'}`} aria-hidden="true" />}
      <Floaters k={`res.${id}`} />
    </button>
  );
});

function DateLabel() {
  const label = useStore((s) => (s.sim ? dateLabel(s.sim) : ''));
  return <span className="hud-date">{label}</span>;
}

function Pc() {
  const pc = useStore((s) => s.sim?.state.pc ?? 0);
  return (
    <span className="hud-pc" title={t('hud.pcLong')}>
      <span className="hud-pc__coin" aria-hidden="true" />
      <b>{pc}</b> {t('hud.pc')}
    </span>
  );
}

export function ProjectionBadge() {
  const p = useStore((s) => s.sim?.state.projection.P ?? 0);
  const pct = Math.round(p * 100);
  return (
    <span className={`projection${pct < 35 ? ' projection--bad' : pct >= 55 ? ' projection--good' : ''}`} data-tut-target="map">
      <span className="projection__long">{t('hud.projection')}</span>
      <span className="projection__short">{t('hud.projectionShort')}</span>{' '}
      <b key={pct} className="flash-num">
        {pct} %
      </b>
    </span>
  );
}

function SpeedControls() {
  const store = getStore();
  const speed = useStore((s) => s.ui.speed);
  const paused = useStore((s) => s.ui.userPaused);
  return (
    <span className="speed" role="group">
      <button className={`btn-icon${paused ? ' is-on' : ''}`} onClick={() => store.togglePause()} aria-label={paused ? t('hud.play') : t('hud.pause')} aria-pressed={paused}>
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
  const mock = useStore((s) => s.data?.budget.source === 'MOCK DATA');
  return (
    <header className="topbar" data-tut-target="topbar">
      <div className="topbar__resources">
        {RESOURCE_IDS.map((r) => (
          <ResourceBar key={r} id={r} />
        ))}
      </div>
      <div className="topbar__meta">
        <Pc />
        <DateLabel />
        <SpeedControls />
        <ProjectionBadge />
        {mock && <span className="mock-badge">{t('hud.mockData')}</span>}
      </div>
    </header>
  );
}
