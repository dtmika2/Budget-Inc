/**
 * Effects as three lanes (phase 22, Daniel's variant A): Zdroje (always all four resources), Skupiny
 * (anger of the affected groups) and Kraje (affected kraje). Each value has a bar from the middle (right =
 * good for the player, left = bad) in its resource / group colour; ongoing effects sit in their target's
 * lane. Never shows budget chapters.
 *
 * Optional (budget vote, phase 23): `highlight` dims the rows not in it, `part` outlines one share of each
 * value, `selected` marks a row, and `onRowHover` makes rows inspectable (pointer or keyboard focus).
 * With `base` (P24, policy cards) each row also shows where the value ends up from today's state, and its
 * numbers explain themselves in a hover card (see laneTip.tsx).
 */
import type { MetricKey } from '@core/budgetAdvice';
import type { PreviewRanges } from '@core/effects';
import type { OngoingDef, Range } from '@core/types';
import { GROUP_IDS, RESOURCE_IDS } from '@core/types';
import { fmtSigned, t } from '@i18n/index';
import { GROUP_COLOR, RESOURCE_COLOR } from '../colors';
import { mid, rangeText } from '../format';
import { HoverCard } from '../HoverCard';
import { laneTipInfo } from './laneTip';

const MAX_KRAJE = 6;

interface Row {
  key: string;
  metric: MetricKey;
  label: string;
  color?: string;
  range?: Range;
  /** Anger: up is bad, so the bar and the colour flip. */
  anger?: boolean;
}

function Bar({ r, part, anger, color, scale }: { r?: Range; part?: Range; anger?: boolean; color?: string; scale: number }) {
  const seg = (x: Range) => {
    const v = mid(x);
    const good = anger ? v < 0 : v > 0;
    return { [good ? 'left' : 'right']: '50%', width: `${Math.min(50, (Math.abs(v) / scale) * 50)}%` };
  };
  return (
    <span className="lane__bar">
      {r && <i style={{ ...seg(r), background: color }} />}
      {part && Math.abs(mid(part)) >= 0.05 && <i className="lane__part" style={seg(part)} />}
    </span>
  );
}

export const metricId = (m: MetricKey) => `${m.kind}:${m.id}`;

/** "41 → 44": today's value and where the card's midpoint takes it (0–100). */
function BaseTo({ now, delta, tone }: { now?: number; delta: number; tone: string }) {
  if (now === undefined) return <span className="lane__to" />;
  const after = clamp100(now + delta);
  return (
    <span className={`lane__to lane__to--${Math.abs(after - now) < 0.5 ? 'none' : tone}`}>
      {Math.round(now)} → <b>{Math.round(after)}</b>
    </span>
  );
}

/** Today's values: attributes, group anger and kraj support (P24, "41 → 44"). */
export interface LaneBase {
  resources: Record<string, number>;
  anger: Record<string, number>;
  regions: Record<string, number>;
}

interface Inspect {
  base?: LaneBase;
  /** Footnote of the number hover cards, when the default does not fit the card. */
  tipHint?: string;
  highlight?: Set<string>;
  part?: PreviewRanges;
  selected?: string;
  onRowHover?: (m: MetricKey) => void;
}

const baseOf = (b: LaneBase | undefined, m: MetricKey): number | undefined =>
  !b ? undefined : m.kind === 'resource' ? b.resources[m.id] : m.kind === 'group' ? b.anger[m.id] : b.regions[m.id];
const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

const partOf = (p: PreviewRanges | undefined, m: MetricKey): Range | undefined =>
  !p ? undefined : m.kind === 'resource' ? p.resources[m.id] : m.kind === 'group' ? p.anger[m.id] : p.regions[m.id];

function Lane({ icon, title, rows, extra, ins, ongoing }: { icon: string; title: string; rows: Row[]; extra?: React.ReactNode; ins: Inspect; ongoing: readonly OngoingDef[] }) {
  const scale = Math.max(6, ...rows.map((r) => (r.range ? Math.max(Math.abs(r.range.min), Math.abs(r.range.max)) : 0)));
  return (
    <div className="lane">
      <p className="lane__head">
        <span className="lane__icon" aria-hidden="true">
          {icon}
        </span>
        {title}
      </p>
      {rows.map((row) => {
        const v = row.range ? mid(row.range) : 0;
        const good = row.anger ? v < 0 : v > 0;
        const tone = !row.range || Math.abs(v) < 0.05 ? 'none' : good ? 'good' : 'bad';
        const now = baseOf(ins.base, row.metric);
        const numbers = (
          <>
            <span className={`lane__num lane__num--${tone}`}>
              {!row.range ? '–' : `${row.anger ? (v > 0 ? '▲' : '▼') : ''}${rangeText(row.range)}`}
            </span>
            {ins.base && <BaseTo now={now} delta={row.range ? mid(row.range) : 0} tone={tone} />}
          </>
        );
        const target = row.metric.kind === 'group' ? `anger.${row.metric.id}` : row.metric.id;
        return (
          <div
            key={row.key}
            className={`lane__row${ins.highlight && !ins.highlight.has(metricId(row.metric)) ? ' is-dim' : ''}${ins.selected === metricId(row.metric) ? ' is-selected' : ''}${ins.onRowHover ? ' is-inspectable' : ''}`}
            tabIndex={ins.onRowHover ? 0 : undefined}
            onPointerEnter={ins.onRowHover && (() => ins.onRowHover!(row.metric))}
            onFocus={ins.onRowHover && (() => ins.onRowHover!(row.metric))}
          >
            <span className="lane__label">
              {row.color && <span className="lane__key" style={{ background: row.color }} />}
              {row.label}
            </span>
            <Bar r={row.range} part={partOf(ins.part, row.metric)} anger={row.anger} color={row.color ?? (good ? 'var(--good-on-paper)' : 'var(--bad-on-paper)')} scale={scale} />
            {ins.base ? (
              <HoverCard
                className="lane__tip"
                focusable
                info={laneTipInfo({ metric: row.metric, label: row.label, accent: row.color, range: row.range, now, ongoing: ongoing.filter((o) => o.target === target), tone, hint: ins.tipHint })}
              >
                {numbers}
              </HoverCard>
            ) : (
              numbers
            )}
          </div>
        );
      })}
      {extra}
    </div>
  );
}

export function EffectLanes({ preview, chaos = 0, ...ins }: { preview: PreviewRanges; chaos?: number } & Inspect) {
  const ongoing = (target: string) =>
    preview.ongoing
      .filter((o) => o.target === target)
      .map((o, i) => (
        <p key={`${target}${i}`} className="lane__ongoing">
          {'↻'} {t('lanes.ongoing', { what: target.startsWith('anger.') ? t(`group.${target.slice(6)}`) : t(`resource.short.${target}`), v: fmtSigned(o.perDay, 2), days: o.days })}
        </p>
      ));
  // a card that touches no resource collapses the lane; the budget screen keeps all four, so its rows never jump
  const touchesResources = RESOURCE_IDS.some((r) => {
    const range = preview.resources[r];
    return (range && (Math.abs(range.min) > 1e-9 || Math.abs(range.max) > 1e-9)) || preview.ongoing.some((o) => o.target === r);
  });
  const collapseResources = !!ins.base && !touchesResources;
  const resources: Row[] = collapseResources
    ? []
    : RESOURCE_IDS.map((r) => ({ key: r, metric: { kind: 'resource', id: r }, label: t(`resource.short.${r}`), color: RESOURCE_COLOR[r], range: preview.resources[r] }));
  const groups: Row[] = GROUP_IDS.filter((g) => preview.anger[g] || preview.ongoing.some((o) => o.target === `anger.${g}`)).map((g) => ({
    key: g,
    metric: { kind: 'group', id: g },
    label: t(`group.${g}`),
    color: GROUP_COLOR[g],
    range: preview.anger[g],
    anger: true,
  }));
  const kraje = Object.entries(preview.regions)
    .filter((e): e is [string, Range] => !!e[1])
    .sort((a, b) => Math.abs(mid(b[1])) - Math.abs(mid(a[1])));
  const shown: Row[] = kraje.slice(0, MAX_KRAJE).map(([code, r]) => ({ key: code, metric: { kind: 'kraj', id: code }, label: t(`region.short.${code}`), range: r }));
  const more = kraje.length - shown.length;
  return (
    <div className={`lanes${ins.base ? ' lanes--base' : ''}`}>
      <Lane
        icon="$"
        title={t('lanes.resources')}
        rows={resources}
        ins={ins}
        ongoing={preview.ongoing}
        extra={
          <>
            {collapseResources && <p className="lane__empty">{t('lanes.noResources')}</p>}
            {RESOURCE_IDS.flatMap((r) => ongoing(r))}
          </>
        }
      />
      <Lane
        icon="☺"
        title={t('lanes.groups')}
        rows={groups}
        ins={ins}
        ongoing={preview.ongoing}
        extra={
          <>
            {groups.length === 0 && <p className="lane__empty">{t('lanes.noGroups')}</p>}
            {GROUP_IDS.flatMap((g) => ongoing(`anger.${g}`))}
          </>
        }
      />
      <Lane
        icon="⌖"
        title={t('lanes.kraje')}
        rows={shown}
        ins={ins}
        ongoing={preview.ongoing}
        extra={
          <>
            {kraje.length === 0 && <p className="lane__empty">{t('lanes.noKraje')}</p>}
            {more > 0 && <p className="lane__empty">{t('lanes.moreKraje', { n: more })}</p>}
          </>
        }
      />
      {(preview.pc !== 0 || chaos > 0) && (
        <p className="lanes__foot">
          {preview.pc !== 0 && <span>{t('lanes.pc', { v: fmtSigned(preview.pc) })}</span>}
          {chaos > 0 && <span>{t('lanes.chaos', { n: chaos })}</span>}
        </p>
      )}
    </div>
  );
}
