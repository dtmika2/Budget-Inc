/**
 * Election night (spec §4.6): regions light up one by one in the reveal order (~1.2 s each, skippable),
 * each showing s_r_final and seats won / seats_r; a running total climbs toward the 101 line. The result
 * was computed by the core from one model, so the reveal can never contradict the outcome.
 */
import { useEffect, useState } from 'react';
import { config } from '@/config';
import { fmt, t } from '@i18n/index';
import { LiquidDefs, LiquidRegion, MAP_HEIGHT, MAP_WIDTH, REGION_PATHS } from '@/regions';
import { getStore } from '../store';

const REVEAL_MS = 1200;

export function ElectionNight() {
  const store = getStore();
  const sim = store.sim!;
  const result = sim.state.election!;
  const order = sim.data.regions.revealOrder;
  const [shown, setShown] = useState(0);
  const done = shown >= order.length;

  useEffect(() => {
    if (done) return;
    const id = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 600 : REVEAL_MS);
    return () => window.clearTimeout(id);
  }, [shown, done]);

  const revealed = new Set(order.slice(0, shown));
  const byCode = new Map(result.regions.map((r) => [r.code, r]));
  const total = result.regions.filter((r) => revealed.has(r.code)).reduce((s, r) => s + r.won, 0);
  const seats = config.election.totalSeats;
  const majority = config.election.majority;
  const last = shown > 0 ? byCode.get(order[shown - 1]) : null;

  return (
    <div className="modal-backdrop modal-backdrop--solid">
      <section className="modal modal--election" role="dialog" aria-modal="true" aria-labelledby="election-title">
        <header className="modal__head">
          <div>
            <h2 id="election-title" className="h-display">
              {t('election.title')}
            </h2>
            {result.snap && <p className="modal__sub election__snap">{t('election.snap')}</p>}
          </div>
          {!done && (
            <button className="btn btn--small" onClick={() => setShown(order.length)}>
              {t('election.skip')}
            </button>
          )}
        </header>

        <svg className="election__map" viewBox={`-6 -6 ${MAP_WIDTH + 12} ${MAP_HEIGHT + 12}`} aria-hidden="true">
          <LiquidDefs prefix="night" />
          {REGION_PATHS.map((r) => {
            const res = byCode.get(r.code);
            const on = revealed.has(r.code);
            return <LiquidRegion key={r.code} prefix="night" code={r.code} d={r.d} support={on && res ? res.s_final : 0} />;
          })}
          {REGION_PATHS.map((r) => (
            <path key={r.code} d={r.d} fillRule="evenodd" fill="none" className={`region${revealed.has(r.code) ? ' is-revealed' : ' is-pending'}`} />
          ))}
          {REGION_PATHS.map((r) => {
            const res = byCode.get(r.code);
            if (!res || !revealed.has(r.code)) return null;
            return (
              <text key={r.code} x={r.labelX} y={r.labelY} className="election__label" textAnchor="middle">
                {t('election.regionSeats', { won: res.won, seats: res.seats })}
              </text>
            );
          })}
        </svg>

        <div className="election__status" aria-live="polite">
          {last ? (
            <span>
              {t(`region.${last.code}`)}: {fmt(last.s_final, 1)} % · {t('election.regionSeats', { won: last.won, seats: last.seats })}
            </span>
          ) : (
            <span>{t('election.counting')}</span>
          )}
        </div>

        <div className="seatbar" role="img" aria-label={`${t('election.total')}: ${total} / ${seats}`}>
          <span className="seatbar__fill" style={{ width: `${(total / seats) * 100}%`, background: sim.leaderDef.color }} />
          <span className="seatbar__majority" style={{ left: `${(majority / seats) * 100}%` }}>
            <span>{t('election.majority', { n: majority })}</span>
          </span>
          <span className="seatbar__count">
            {t('election.total')}: <b>{total}</b>
          </span>
        </div>

        {done && (
          <div className={`election__outcome ${result.win ? 'is-win' : 'is-loss'}`}>
            <p className="h-display">{result.win ? t('election.win') : t('election.loss')}</p>
            <button className="btn btn--stamp btn--big" onClick={() => store.finishPresentation()} autoFocus>
              {t('election.continue')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
