/** Text for the budget commentary: structured advice reasons from the core turned into Czech via t(). */
import type { AdviceReason, MetricKey, Suggestion } from '@core/budgetAdvice';
import { metricUpIsGood } from '@core/budgetAdvice';
import { config } from '@/config';
import type { Simulation } from '@core/simulation';
import { fmtSigned, t } from '@i18n/index';

const { stepPct } = config.budgetVote.sliders;

export const areaName = (sim: Simulation, id: string) => t(sim.data.budgetItems.find((i) => i.id === id)?.label ?? id);

/** A slider position as a percentage ("+20 %", "0 %"). */
export const stepText = (v: number) => (v === 0 ? '0 %' : `${fmtSigned(v * stepPct)} %`);

export function metricName(m: MetricKey): string {
  return m.kind === 'resource' ? t(`resource.short.${m.id}`) : m.kind === 'group' ? t(`group.${m.id}`) : t(`region.short.${m.id}`);
}

/** A metric change as text: a resource with its delta, or a group / kraj with what changes. */
export function metricText(m: MetricKey, delta: number): string {
  const v = fmtSigned(delta, 1);
  return m.kind === 'resource' ? `${metricName(m)} ${v}` : t(m.kind === 'group' ? 'budgetVote.advice.anger' : 'budgetVote.advice.krajSupport', { name: metricName(m), v });
}

export const isGood = (m: MetricKey, delta: number) => (metricUpIsGood(m) ? delta > 0 : delta < 0);

/** One sentence per non-metric reason (metric reasons are shown as chips). */
export function reasonText(sim: Simulation, r: AdviceReason): string {
  switch (r.kind) {
    case 'zoneEnter':
      return t(`budgetVote.advice.zoneEnter.${r.zone}`, { area: areaName(sim, r.item) });
    case 'zoneLeave':
      return t('budgetVote.advice.zoneLeave', { area: areaName(sim, r.item) });
    case 'pass':
      return t('budgetVote.advice.pass', { v: fmtSigned(r.delta * 100) });
    case 'redLine':
      return t('budgetVote.advice.redLine', { area: areaName(sim, r.item), pct: r.maxCutSteps * stepPct });
    case 'redLineFixed':
      return t('budgetVote.advice.redLineFixed', { area: areaName(sim, r.item) });
    case 'pledgeMet':
      return t('budgetVote.advice.pledgeMet', { area: areaName(sim, r.item), region: t(`region.short.${r.region}`) });
    case 'pledgeBroken':
      return t('budgetVote.advice.pledgeBroken', { area: areaName(sim, r.item), region: t(`region.short.${r.region}`) });
    case 'metric':
      return metricText(r.metric, r.delta);
  }
}

/** Is this reason good news for the player? */
export function reasonGood(r: AdviceReason): boolean {
  switch (r.kind) {
    case 'zoneLeave':
    case 'redLineFixed':
    case 'pledgeMet':
      return true;
    case 'pass':
      return r.delta > 0;
    case 'metric':
      return isGood(r.metric, r.delta);
    default:
      return false;
  }
}

export function Chip({ text, tone }: { text: string; tone: 'good' | 'bad' | 'none' }) {
  return <span className={`bchip bchip--${tone}`}>{text}</span>;
}

/** Metric reasons as a row of coloured chips. */
export function MetricChips({ reasons }: { reasons: AdviceReason[] }) {
  const ms = reasons.filter((r): r is Extract<AdviceReason, { kind: 'metric' }> => r.kind === 'metric');
  if (ms.length === 0) return null;
  return (
    <span className="bchips">
      {ms.map((r) => (
        <Chip key={`${r.metric.kind}.${r.metric.id}`} text={metricText(r.metric, r.delta)} tone={isGood(r.metric, r.delta) ? 'good' : 'bad'} />
      ))}
    </span>
  );
}

/** Title of a recommendation card. */
export function suggestionTitle(sim: Simulation, s: Suggestion, focusItem?: string): string {
  if (s.kind === 'preset') return t('budgetVote.advice.usePreset', { name: t(sim.data.budgetVote.find((o) => o.id === s.presetId)?.label ?? '') });
  if (s.kind === 'keep') return focusItem ? t('budgetVote.advice.keep', { area: areaName(sim, focusItem), v: stepText(s.sliders[focusItem] ?? 0) }) : t('budgetVote.advice.keepAll');
  const v = stepText(s.sliders[s.item!] ?? 0);
  return t(s.dir! > 0 ? 'budgetVote.advice.raise' : 'budgetVote.advice.cut', { area: areaName(sim, s.item!), v });
}
