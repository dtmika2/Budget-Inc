import { useMemo } from 'react';
import { config } from '@/config';
import { t } from '@i18n/index';
import { pct } from '../../format';

const ROWS = 7;

/** Seat positions of a hemicycle, ordered left to right (by angle), so "first n seats" is a left wedge. */
function seatLayout(total: number): { x: number; y: number }[] {
  const radii = Array.from({ length: ROWS }, (_, i) => 40 + i * 13);
  const sum = radii.reduce((a, b) => a + b, 0);
  const seats: { x: number; y: number; a: number }[] = [];
  let left = total;
  radii.forEach((r, i) => {
    const n = i === ROWS - 1 ? left : Math.round((total * r) / sum);
    left -= n;
    for (let k = 0; k < n; k++) {
      const a = Math.PI * (n === 1 ? 0.5 : k / (n - 1));
      seats.push({ x: 130 - r * Math.cos(a), y: 128 - r * Math.sin(a), a });
    }
  });
  return seats.sort((p, q) => p.a - q.a || q.y - p.y);
}

/**
 * Small chamber picture of the pass chance (display only: the vote itself is one pass chance). The share
 * of green seats equals the chance; seats the inspected change would win or lose are outlined.
 */
export function ChamberEstimate({ chance, next, chips, compact = false }: { chance: number; next: number | null; chips?: React.ReactNode; compact?: boolean }) {
  const total = config.budgetAdvice.chamberSeats;
  const seats = useMemo(() => seatLayout(total), [total]);
  const yes = Math.round(chance * total);
  const yesNext = next === null ? yes : Math.round(next * total);
  const lo = Math.min(yes, yesNext);
  const hi = Math.max(yes, yesNext);
  const shown = next ?? chance;
  const tone = shown >= 0.6 ? 'good' : shown >= 0.4 ? 'warn' : 'bad';
  return (
    <section className={`bchamber${compact ? ' bchamber--compact' : ''}`} aria-label={t('budgetVote.chamber.title')}>
      {!compact && (
        <p className="bpanel__head">
          <span>{t('budgetVote.chamber.title')}</span>
          <span>{t('budgetVote.chamber.note')}</span>
        </p>
      )}
      <div className="bchamber__row">
        <svg viewBox="0 0 260 132" className="bchamber__svg" aria-hidden="true">
          {seats.map((s, i) => {
            const green = i < yesNext;
            const changed = i >= lo && i < hi;
            return (
              <circle
                key={i}
                cx={s.x.toFixed(1)}
                cy={s.y.toFixed(1)}
                r={3.6}
                className={`bchamber__seat${green ? ' is-yes' : ''}${changed ? ' is-change' : ''}`}
              />
            );
          })}
          <line x1="130" y1="30" x2="130" y2="130" className="bchamber__mid" />
        </svg>
        <div className={`bchamber__odds bchamber__odds--${tone}`}>
          <b>{pct(shown)}</b>
          {next !== null && Math.abs(next - chance) >= 0.005 && (
            <span className={next > chance ? 'is-up' : 'is-down'}>{t('budgetVote.chamber.from', { v: pct(chance) })}</span>
          )}
          <small>{t(`budgetVote.chamber.${tone}`)}</small>
          {compact && <small className="bchamber__label">{t('budgetVote.chamber.title')}</small>}
        </div>
      </div>
      {chips && <div className="bchips">{chips}</div>}
    </section>
  );
}
