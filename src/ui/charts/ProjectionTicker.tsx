/**
 * Always-visible mini chart in the map corner: the weekly election projection P over the last
 * `charts.tickerWeeks` weeks, with the 50 % line. A single series, so the title names it (no legend).
 */
import { config } from '@/config';
import { t } from '@i18n/index';
import { useStore } from '../store';

const W = 132;
const H = 40;

export function ProjectionTicker() {
  const ps = useStore((s) => (s.sim ? s.sim.state.trend.slice(-config.charts.tickerWeeks).map((p) => Math.round(p.P * 1000) / 10) : []));
  if (ps.length < 2) return null;
  const x = (i: number) => Math.round((i / (ps.length - 1)) * (W - 8)) + 1;
  const y = (v: number) => Math.round(H - 3 - (Math.max(0, Math.min(100, v)) / 100) * (H - 6));
  const d = ps.map((v, i) => (i === 0 ? `M${x(0)} ${y(v)}` : `H${x(i)} V${y(v)}`)).join(' ');
  const cur = ps[ps.length - 1];
  const delta = cur - ps[ps.length - 2];
  const tone = cur >= 50 ? 'good' : 'bad';
  return (
    <div className={`ticker ticker--${tone}`} role="img" aria-label={`${t('chart.projection')}: ${Math.round(cur)} %`}>
      <span className="ticker__head">
        <span>{t('chart.projection')}</span>
        <b>
          {Math.round(cur)} %{delta !== 0 && <i className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? '▲' : '▼'}</i>}
        </b>
      </span>
      <svg width={W} height={H} aria-hidden="true">
        <line x1={0} x2={W} y1={y(50)} y2={y(50)} className="ticker__mid" />
        <path d={d} className="ticker__line" />
        <rect x={x(ps.length - 1) - 3} y={y(cur) - 3} width={6} height={6} className="ticker__dot" />
      </svg>
    </div>
  );
}
