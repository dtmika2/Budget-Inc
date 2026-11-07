/**
 * Hover card for the numbers of one effect-lane row on a policy card: what the value is, what the card's
 * range means, where the value ends up and what that does in the game. Text only; every rule it describes
 * comes from the state and config, so the card stays true when the numbers are retuned.
 */
import { config } from '@/config';
import type { MetricKey } from '@core/budgetAdvice';
import { groupTargets } from '@core/groupPressure';
import type { GroupId, OngoingDef, Range } from '@core/types';
import { fmtSigned, t } from '@i18n/index';
import type { HoverInfo } from '../HoverCard';
import { mid, rangeText, resourceZone } from '../format';
import { getStore } from '../store';

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

function changeText(metric: MetricKey, range: Range | undefined): string {
  if (!range) return t('lanes.tip.none');
  const text = rangeText(range);
  const change = t(`lanes.tip.change.${metric.kind}`, { range: text });
  return text.includes('…') ? `${change} ${t('lanes.tip.roll')}` : change;
}

function resultText(now: number, range: Range | undefined): string {
  const from = Math.round(now);
  const after = Math.round(clamp100(now + (range ? mid(range) : 0)));
  if (!range || after === from) return t('lanes.tip.stays', { now: from });
  const lo = Math.round(clamp100(now + range.min));
  const hi = Math.round(clamp100(now + range.max));
  return lo === hi ? t('lanes.tip.to', { now: from, after }) : t('lanes.tip.toRange', { now: from, lo, hi, after });
}

function resourceEffect(now: number, range: Range | undefined): string[] {
  const before = t(`resource.zone.${resourceZone(now)}`);
  const after = t(`resource.zone.${resourceZone(clamp100(now + (range ? mid(range) : 0)))}`);
  const zone = before === after ? t('lanes.tip.zoneSame', { zone: after }) : t('lanes.tip.zoneMove', { from: before, to: after });
  return range && now > 0 && now + range.min <= 0 ? [zone, t('lanes.tip.zero')] : [zone];
}

function groupEffect(g: GroupId, now: number, range: Range | undefined): string[] {
  const after = clamp100(now + (range ? mid(range) : 0));
  const n = getStore().sim?.data.endings.find((e) => e.group === g)?.threshold ?? config.anger.max;
  const state = after >= config.anger.warnAt ? 'critical' : after >= config.anger.pulseAt ? 'hot' : 'calm';
  const out = [t(`hover.anger.${state}`, { n })];
  const from = config.groupPressure.from;
  if (after > from) out.push(t('lanes.tip.drain', { from, list: groupTargets(config, g).map((r) => t(`resource.short.${r.resource}`)).join(', ') }));
  if (after > config.election.angerThreshold) out.push(t('lanes.tip.threshold'));
  return out.length > 1 ? out : [...out, t('lanes.tip.quiet', { from })];
}

function krajEffect(code: string): string[] {
  const seats = getStore().sim?.data.regions.regions.find((r) => r.code === code)?.seats;
  return seats === undefined ? [] : [t('lanes.tip.kraj', { seats })];
}

function Section({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="lanetip">
      <b className="lanetip__head">{title}</b>
      {lines.map((line, i) => (
        <p key={i} className="lanetip__line">
          {line}
        </p>
      ))}
    </div>
  );
}

export function laneTipInfo({
  metric,
  label,
  accent,
  range,
  now,
  ongoing,
  tone,
  hint,
}: {
  metric: MetricKey;
  label: string;
  accent?: string;
  range?: Range;
  /** Today's value (undefined: no base value known, the result section is left out). */
  now?: number;
  ongoing: readonly OngoingDef[];
  tone: 'good' | 'bad' | 'none';
  /** Replaces the default footnote (compromise cards are still scaled when they are sold). */
  hint?: string;
}): HoverInfo {
  const after = now === undefined ? undefined : clamp100(now + (range ? mid(range) : 0));
  const effect = now === undefined ? [] : metric.kind === 'resource' ? resourceEffect(now, range) : metric.kind === 'group' ? groupEffect(metric.id as GroupId, now, range) : krajEffect(metric.id);
  return {
    title: label,
    accent,
    desc: metric.kind === 'resource' ? t(`resource.desc.${metric.id}`) : metric.kind === 'group' ? t(`group.desc.${metric.id}`) : t('lanes.tip.krajDesc'),
    value: now === undefined || after === undefined ? undefined : `${Math.round(now)} → ${Math.round(after)}`,
    valueColor: tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : undefined,
    extra: (
      <>
        <Section title={t('lanes.tip.meaning')} lines={[changeText(metric, range), ...ongoing.map((o) => t('lanes.tip.ongoing', { v: fmtSigned(o.perDay, 2), days: o.days }))]} />
        {now !== undefined && <Section title={t('lanes.tip.result')} lines={[resultText(now, range)]} />}
        {effect.length > 0 && <Section title={t('lanes.tip.effect')} lines={effect} />}
      </>
    ),
    hint: hint ?? t('lanes.tip.hint'),
  };
}
