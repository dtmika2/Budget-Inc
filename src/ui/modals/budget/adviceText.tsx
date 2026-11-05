/** Text for the budget commentary: structured advice reasons from the core turned into Czech via t(). */
import type { AdviceReason, MetricKey } from '@core/budgetAdvice';
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
    case 'requestMet':
      return t('budgetVote.req.reasonMet', { party: t(`party.${r.party}`), area: areaName(sim, r.item) });
    case 'requestMissed':
      return t(r.dir > 0 ? 'budgetVote.req.reasonMissRaise' : 'budgetVote.req.reasonMissCut', { party: t(`party.${r.party}`), area: areaName(sim, r.item) });
    case 'metric':
      return metricText(r.metric, r.delta);
  }
}

export function Chip({ text, tone }: { text: string; tone: 'good' | 'bad' | 'none' }) {
  return <span className={`bchip bchip--${tone}`}>{text}</span>;
}
