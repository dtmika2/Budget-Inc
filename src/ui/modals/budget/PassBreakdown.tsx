import { config } from '@/config';
import { passChanceParts, type Sliders } from '@core/budgetVote';
import type { Simulation } from '@core/simulation';
import { fmtSigned, t } from '@i18n/index';
import { pct } from '../../format';

const ORDER = ['base', 'coalition', 'preset', 'steps', 'zones', 'redLines', 'requests'] as const;

/** Bottom of the impact column (P31): the pass chance in its parts, for the shown (or hovered) sliders. */
export function PassBreakdown({ sim, sliders, presetId }: { sim: Simulation; sliders: Sliders; presetId: string | null }) {
  const p = passChanceParts(sim, sliders, presetId);
  const b = config.budgetVote;
  const points = (v: number) => `${fmtSigned(Math.round(v * 100))} b.`;
  return (
    <section className="bpass" aria-label={t('budgetVote.parts.title')}>
      <h4 className="bpass__title">{t('budgetVote.parts.title')}</h4>
      {ORDER.filter((k) => k === 'base' || Math.abs(p[k]) >= 0.005).map((k) => (
        <p key={k} className={`bpass__row${k === 'base' ? '' : p[k] > 0 ? ' is-good' : ' is-bad'}`}>
          <span>{t(`budgetVote.parts.${k}`)}</span>
          <b>{k === 'base' ? pct(p[k]) : points(p[k])}</b>
        </p>
      ))}
      <p className="bpass__row bpass__row--total">
        <span>{t('budgetVote.parts.total')}</span>
        <b>{pct(p.total)}</b>
      </p>
      <p className="bpass__note">{t('budgetVote.parts.clamped', { min: Math.round(b.passMin * 100), max: Math.round(b.passMax * 100) })}</p>
    </section>
  );
}
