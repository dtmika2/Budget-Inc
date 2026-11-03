/**
 * Line chart of a region's support over the term (phase 13). One data series (the region, gold) plus a
 * muted dashed reference line (national support). Markers show what changed the region (shape = source
 * type, so identity is never colour-alone). Crosshair + tooltip on hover/touch; a table view for
 * accessibility.
 */
import { useMemo, useState } from 'react';
import { config } from '@/config';
import { fmt, fmtSigned, t } from '@i18n/index';

export interface ChartMarker {
  key: string;
  absDay: number;
  kind: string;
  label: string;
  delta: number;
}

interface Props {
  points: { absDay: number; v: number; national: number }[];
  markers: ChartMarker[];
  highlighted: string | null;
  onMarker: (key: string) => void;
}

const W = 640;
const H = 230;
const PAD = { l: 34, r: 12, t: 12, b: 24 };

export function markerShape(kind: string, x: number, y: number, r = 5): string {
  switch (kind) {
    case 'compromise': // square
      return `M${x - r} ${y - r}h${2 * r}v${2 * r}h${-2 * r}z`;
    case 'demand': // diamond
      return `M${x} ${y - r - 1}l${r + 1} ${r + 1}l${-r - 1} ${r + 1}l${-r - 1} ${-r - 1}z`;
    case 'chaos': // triangle
      return `M${x} ${y - r - 1}l${r + 1} ${2 * r + 1}h${-2 * r - 2}z`;
    default: // circle (policy, other)
      return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  }
}

export function RegionChart({ points, markers, highlighted, onMarker }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const termDays = config.time.quarters * config.time.daysPerQuarter;

  const { lo, hi } = useMemo(() => {
    const vals = points.flatMap((p) => [p.v, p.national]);
    const mn = Math.min(...vals, 50);
    const mx = Math.max(...vals, 50);
    return { lo: Math.max(0, Math.floor((mn - 5) / 10) * 10), hi: Math.min(100, Math.ceil((mx + 5) / 10) * 10) };
  }, [points]);
  const x = (d: number) => PAD.l + ((d - 1) / (termDays - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const path = (key: 'v' | 'national') => points.map((p, i) => `${i ? 'L' : 'M'}${x(p.absDay).toFixed(1)} ${y(p[key]).toFixed(1)}`).join('');
  const valueAt = (d: number) => {
    let best = points[0];
    for (const p of points) if (p.absDay <= d) best = p;
    return best?.v ?? 50;
  };
  const ticks = [];
  for (let v = lo; v <= hi; v += 10) ticks.push(v);
  const quarters = Array.from({ length: config.time.quarters - 1 }, (_, i) => (i + 1) * config.time.daysPerQuarter + 1);
  const votes = config.budgetVote.quarters.map((q) => (q - 1) * config.time.daysPerQuarter + config.budgetVote.day);
  const last = points[points.length - 1];
  const hp = hover !== null ? points[hover] : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let bi = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.absDay) - px);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    setHover(bi);
  };

  if (table)
    return (
      <div className="rchart">
        <button className="btn btn--ghost rchart__toggle" onClick={() => setTable(false)}>
          {t('region.screen.chart')}
        </button>
        <div className="rchart__table">
          <table>
            <thead>
              <tr>
                <th>{t('region.screen.colWeek')}</th>
                <th>{t('region.screen.colRegion')}</th>
                <th>{t('region.screen.colNational')}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i}>
                  <td>{Math.floor((p.absDay - 1) / 7) + 1}</td>
                  <td>{fmt(p.v, 1)}</td>
                  <td>{fmt(p.national, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

  return (
    <div className="rchart">
      <div className="rchart__legend">
        <span className="rchart__key rchart__key--region">{t('region.screen.regionLine')}</span>
        <span className="rchart__key rchart__key--national">{t('region.screen.national')}</span>
        <button className="btn btn--ghost rchart__toggle" onClick={() => setTable(true)}>
          {t('region.screen.table')}
        </button>
      </div>
      <svg
        className="rchart__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t('region.screen.history')}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line className="rchart__grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
            <text className="rchart__tick" x={PAD.l - 6} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {quarters.map((d) => (
          <line key={d} className="rchart__quarter" x1={x(d)} x2={x(d)} y1={PAD.t} y2={H - PAD.b} />
        ))}
        {votes.map((d) => (
          <line key={`v${d}`} className="rchart__vote" x1={x(d)} x2={x(d)} y1={PAD.t} y2={H - PAD.b} />
        ))}
        {[1, 5, 9, 13].map((q) => (
          <text key={q} className="rchart__tick" x={x((q - 1) * config.time.daysPerQuarter + 1) + 3} y={H - 8}>
            {t('hud.yearShort', { y: Math.ceil(q / 4) })}
          </text>
        ))}
        {points.length > 1 && <path className="rchart__national" d={path('national')} />}
        {points.length > 1 && <path className="rchart__line" d={path('v')} />}
        {last && (
          <text className="rchart__label" x={Math.min(x(last.absDay) + 6, W - PAD.r - 30)} y={y(last.v) - 8}>
            {fmt(last.v)}
          </text>
        )}
        {markers.map((m) => (
          <path
            key={m.key}
            className={`rchart__marker rchart__marker--${m.delta >= 0 ? 'up' : 'down'}${highlighted === m.key ? ' is-on' : ''}`}
            d={markerShape(m.kind, x(m.absDay), y(valueAt(m.absDay)))}
            onPointerDown={(e) => {
              e.stopPropagation();
              onMarker(m.key);
            }}
          >
            <title>{`${m.label} ${fmtSigned(m.delta, 1)}`}</title>
          </path>
        ))}
        {hp && (
          <g className="rchart__cross">
            <line x1={x(hp.absDay)} x2={x(hp.absDay)} y1={PAD.t} y2={H - PAD.b} />
            <circle cx={x(hp.absDay)} cy={y(hp.v)} r={4} />
          </g>
        )}
      </svg>
      {hp && (
        <p className="rchart__tip" role="status">
          {t('region.screen.week', { w: Math.floor((hp.absDay - 1) / 7) + 1 })} · {t('region.screen.regionLine')} <b>{fmt(hp.v, 1)}</b> ·{' '}
          {t('region.screen.national')} <b>{fmt(hp.national, 1)}</b>
        </p>
      )}
    </div>
  );
}
