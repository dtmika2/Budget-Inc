import { useMemo } from 'react';
import { config } from '@/config';
import { explainMetric, explainStep, summarizeBudget, type AdviceReason } from '@core/budgetAdvice';
import type { Sliders } from '@core/budgetVote';
import type { Simulation } from '@core/simulation';
import { fmtSigned, t } from '@i18n/index';
import { mid, pct } from '../../format';
import { areaName, Chip, isGood, metricName, metricText, reasonText, stepText } from './adviceText';
import type { Focus } from './BudgetScreen';

interface Props {
  sim: Simulation;
  sliders: Sliders;
  presetId: string | null;
  focus: Focus;
}

interface View {
  head: string;
  line: string;
  chips: { text: string; tone: 'good' | 'bad' | 'none' }[];
}

/**
 * Middle column, under the chamber: a light commentary (P27, mockup variant A: one sentence): what is being
 * inspected, one sentence and up to three numbers. No recommendations.
 */
export function BudgetCommentary({ sim, sliders, presetId, focus }: Props) {
  const view = useMemo(() => build(sim, sliders, presetId, focus), [sim, sliders, presetId, focus]);
  return (
    <section className="bcomment bcomment--light" aria-live="polite">
      <p className="bcomment__line">
        <b>{view.head}</b> {view.line}
      </p>
      {view.chips.length > 0 && (
        <p className="bchips">
          {view.chips.map((c) => (
            <Chip key={c.text} text={c.text} tone={c.tone} />
          ))}
        </p>
      )}
    </section>
  );
}

const num1 = (v: number) => (Math.abs(v) < 0.05 ? '0' : fmtSigned(v, 1));

function build(sim: Simulation, sliders: Sliders, presetId: string | null, focus: Focus): View {
  const { stepPct } = config.budgetVote.sliders;
  // a slider step
  if (focus?.kind === 'step') {
    const item = sim.data.budgetItems.find((i) => i.id === focus.item);
    if (item) {
      const from = sliders[item.id] ?? 0;
      const name = t(item.label);
      const band = { min: fmtSigned(item.band.min * stepPct), max: fmtSigned(item.band.max * stepPct) };
      if (focus.to === from) return { head: `${name} ${stepText(from)}`, line: t('budgetVote.light.band', band), chips: [] };
      const adv = explainStep(sim, sliders, presetId, item.id, focus.to);
      const own = (k: AdviceReason['kind']) => adv.reasons.find((r) => r.kind === k && 'item' in r && r.item === item.id);
      const entered = own('zoneEnter');
      const event = own('redLine') ?? own('requestMissed') ?? own('requestMet') ?? own('zoneLeave') ?? adv.reasons.find((r) => r.kind === 'pledgeBroken' || r.kind === 'pledgeMet');
      const line =
        entered && entered.kind === 'zoneEnter' && item.advisor
          ? t(item.advisor[entered.zone])
          : event
            ? reasonText(sim, event)
            : t('budgetVote.light.safe', band);
      const dPass = adv.after.passChance - adv.before.passChance;
      const dFin = mid(adv.after.resources.finances ?? zero) - mid(adv.before.resources.finances ?? zero);
      const other = adv.reasons.find((r) => r.kind === 'metric' && !(r.metric.kind === 'resource' && r.metric.id === 'finances'));
      const chips: View['chips'] = [];
      if (Math.abs(dPass) >= 0.005) chips.push({ text: t('budgetVote.advice.passChip', { v: fmtSigned(dPass * 100) }), tone: dPass > 0 ? 'good' : 'bad' });
      if (Math.abs(dFin) >= 0.05) chips.push({ text: `${t('resource.short.finances')} ${num1(dFin)}`, tone: dFin > 0 ? 'good' : 'bad' });
      if (other && other.kind === 'metric') chips.push({ text: metricText(other.metric, other.delta), tone: isGood(other.metric, other.delta) ? 'good' : 'bad' });
      return { head: `${name} ${stepText(from)} → ${stepText(focus.to)}`, line, chips };
    }
  }
  // an impact row: where the number comes from
  if (focus?.kind === 'metric') {
    const m = focus.metric;
    const e = explainMetric(sim, sliders, presetId, m);
    const parts = e.parts.slice(0, 2).map((p) => `${areaName(sim, p.item)} ${num1(p.delta)}`);
    return {
      head: `${metricName(m)} ${num1(e.total)}`,
      line: parts.length ? t('budgetVote.light.parts', { list: parts.join(', ') }) : t('budgetVote.advice.partNone'),
      chips: [],
    };
  }
  // nothing inspected: the biggest open risk, or a hint
  const sum = summarizeBudget(sim, sliders, presetId);
  return {
    head: t('budgetVote.light.all'),
    line: sum.risks.length ? reasonText(sim, sum.risks[0]) : t('budgetVote.advice.hoverHint'),
    chips: [{ text: t('budgetVote.advice.chance', { v: pct(sum.passChance) }), tone: 'none' }],
  };
}

const zero = { min: 0, max: 0 };
