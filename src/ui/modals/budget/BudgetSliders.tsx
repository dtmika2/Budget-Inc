import { config } from '@/config';
import { zoneOf, type Sliders } from '@core/budgetVote';
import type { BudgetItem, CoalitionRequest, RedLine } from '@core/types';
import { t } from '@i18n/index';
import { stepText } from './adviceText';
import type { Focus } from './BudgetScreen';

const { minSteps, maxSteps, stepPct } = config.budgetVote.sliders;
const STEPS = Array.from({ length: maxSteps - minSteps + 1 }, (_, i) => minSteps + i);

interface Props {
  items: BudgetItem[];
  sliders: Sliders;
  focus: Focus;
  redLines: RedLine[];
  violations: string[];
  pledged: Set<string>;
  /** Coalition partners' requests (P30): a tag per request on its area. */
  requests: CoalitionRequest[];
  /** `now`: keyboard focus, applied without the hover delay. */
  onFocus: (f: Focus, now?: boolean) => void;
  onSet: (item: string, v: number) => void;
}

/**
 * Left column: one slider per shown area. Each step is a cell; the safe band is tinted green. Hovering
 * (or arrow keys) shows a ghost step and drives the commentary; a click (or Enter) sets the slider.
 */
export function BudgetSliders({ items, sliders, focus, redLines, violations, pledged, requests, onFocus, onSet }: Props) {
  return (
    <ul className="bsl" aria-label={t('budgetVote.areas')} onPointerLeave={() => onFocus(null)}>
      {items.map((it) => {
        const v = sliders[it.id] ?? 0;
        const zone = zoneOf(it, v);
        const ghost = focus?.kind === 'step' && focus.item === it.id ? focus.to : null;
        const rl = redLines.find((r) => r.item === it.id);
        const crossed = violations.includes(it.id);
        const active = ghost !== null;
        const key = (e: React.KeyboardEvent) => {
          const cur = ghost ?? v;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onFocus({ kind: 'step', item: it.id, to: Math.max(minSteps, cur - 1) }, true);
          else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onFocus({ kind: 'step', item: it.id, to: Math.min(maxSteps, cur + 1) }, true);
          else if ((e.key === 'Enter' || e.key === ' ') && ghost !== null) onSet(it.id, ghost);
          else if (e.key === 'Escape') onFocus(null, true);
          else return;
          e.preventDefault();
        };
        return (
          <li key={it.id} className={`bsl__row bsl__row--${zone}${active ? ' is-active' : ''}`}>
            <span className="bsl__name">
              {t(it.label)}
              {it.core && <span className="bsl__tag">{t('budgetVote.core')}</span>}
              {rl && <span className={`bsl__tag bsl__tag--line${crossed ? ' is-bad' : ''}`} title={t('budgetVote.redLine', { pct: rl.maxCutSteps * stepPct })}>{t('budgetVote.redLineTag')}</span>}
              {pledged.has(it.id) && <span className="bsl__tag bsl__tag--pledge">{t('budgetVote.pledgeTag')}</span>}
              {requests
                .filter((r) => r.item === it.id)
                .map((r) => (
                  <span key={r.party} className={`bsl__tag bsl__tag--req${(v * r.dir >= 1) ? ' is-met' : ''}`}>
                    {t(r.dir > 0 ? 'budgetVote.req.tagRaise' : 'budgetVote.req.tagCut', { party: t(`party.${r.party}`) })}
                  </span>
                ))}
            </span>
            <output className={`bsl__value bsl__value--${zone}`}>{stepText(v)}</output>
            <div
              className="bsl__track"
              role="slider"
              tabIndex={0}
              aria-label={t(it.label)}
              aria-valuemin={minSteps * stepPct}
              aria-valuemax={maxSteps * stepPct}
              aria-valuenow={v * stepPct}
              aria-valuetext={stepText(v)}
              onKeyDown={key}
              // only keyboard focus on the track itself: a click focuses the cell and must not flash a ghost on the old value
              onFocus={(e) => e.target === e.currentTarget && onFocus({ kind: 'step', item: it.id, to: v }, true)}
            >
              {STEPS.map((s) => {
                const inBand = s >= it.band.min && s <= it.band.max;
                return (
                  <button
                    key={s}
                    tabIndex={-1}
                    className={`bsl__cell${inBand ? ' is-band' : ''}${s === 0 ? ' is-zero' : ''}${s === v ? ' is-knob' : ''}${s === ghost && s !== v ? ' is-ghost' : ''}`}
                    aria-label={`${t(it.label)} ${stepText(s)}`}
                    onPointerEnter={() => onFocus({ kind: 'step', item: it.id, to: s })}
                    onClick={() => onSet(it.id, s)}
                  >
                    {s === ghost && s !== v && <span className="bsl__tip">{stepText(s)}</span>}
                  </button>
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
