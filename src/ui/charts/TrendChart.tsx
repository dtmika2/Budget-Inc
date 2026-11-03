/**
 * Weekly trend chart (side panel): stepped pixel lines on one 0-100 axis, a legend with the current
 * values, a crosshair + tooltip on hover/touch, and a screen-reader table. Series colours are the
 * validated categorical slots (see DECISIONS.md), assigned in fixed order.
 */
import { useEffect, useRef, useState } from 'react';
import { config } from '@/config';
import type { TrendPoint } from '@core/types';
import { fmt, t } from '@i18n/index';

export interface Series {
  id: string;
  label: string;
  color: string;
  get: (p: TrendPoint) => number;
}

/** Categorical slots for the dark surface, fixed order (validated: tools in the dataviz skill). */
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];

const H = 132;
const PAD = { l: 26, r: 6, t: 6, b: 18 };

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(260);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(160, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export const quarterOf = (absDay: number) => Math.floor((absDay - 1) / config.time.daysPerQuarter) + 1;

export function TrendChart({
  points,
  series,
  title,
  labelOf,
}: {
  points: readonly TrendPoint[];
  series: Series[];
  title: string;
  /** Tooltip / table label of a weekly point. */
  labelOf: (p: TrendPoint) => string;
}) {
  const [ref, width] = useWidth<HTMLElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const iw = width - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => Math.round(PAD.l + (n <= 1 ? iw : (i / (n - 1)) * iw));
  const y = (v: number) => Math.round(PAD.t + ih - (Math.max(0, Math.min(100, v)) / 100) * ih);
  const path = (s: Series) =>
    points.map((p, i) => (i === 0 ? `M${x(0)} ${y(s.get(p))}` : `H${x(i)} V${y(s.get(p))}`)).join(' ');
  const qTicks: { i: number; q: number }[] = [];
  points.forEach((p, i) => {
    const q = quarterOf(p.absDay);
    if (i === 0 || quarterOf(points[i - 1].absDay) !== q) qTicks.push({ i, q });
  });
  const every = Math.max(1, Math.ceil(qTicks.length / Math.max(1, Math.floor(iw / 34))));
  const hi = hover !== null && hover < n ? hover : null;
  const last = n - 1;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - PAD.l;
    setHover(n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((px / iw) * (n - 1)))));
  };

  return (
    <figure className="chart" ref={ref}>
      <figcaption className="chart__title">{title}</figcaption>
      <ul className="chart__legend">
        {series.map((s) => (
          <li key={s.id}>
            <span className="chart__swatch" style={{ background: s.color }} aria-hidden="true" />
            <span className="chart__name">{s.label}</span>
            <b>{n ? fmt(s.get(points[hi ?? last])) : ''}</b>
          </li>
        ))}
      </ul>
      <div className="chart__plot">
        <svg width={width} height={H} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} aria-hidden="true">
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'chart__axis' : 'chart__grid'} />
              <text x={PAD.l - 5} y={y(v) + 4} textAnchor="end" className="chart__tick">
                {v}
              </text>
            </g>
          ))}
          {qTicks
            .filter((_, k) => k % every === 0)
            .map(({ i, q }) => (
              <text key={q} x={x(i)} y={H - 4} className="chart__tick">
                Q{q}
              </text>
            ))}
          {series.map((s) => (
            <path key={s.id} d={path(s)} stroke={s.color} className="chart__line" />
          ))}
          {n > 0 &&
            series.map((s) => {
              const i = hi ?? last;
              return <rect key={s.id} x={x(i) - 4} y={y(s.get(points[i])) - 4} width={8} height={8} fill={s.color} className="chart__dot" />;
            })}
          {hi !== null && <line x1={x(hi)} x2={x(hi)} y1={PAD.t} y2={PAD.t + ih} className="chart__cross" />}
        </svg>
        {hi !== null && (
          <div className="chart__tip" style={{ left: Math.min(x(hi), width - 120) }}>
            {labelOf(points[hi])}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>{t('chart.when')}</th>
            {series.map((s) => (
              <th key={s.id}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.absDay}>
              <td>{labelOf(p)}</td>
              {series.map((s) => (
                <td key={s.id}>{fmt(s.get(p))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
