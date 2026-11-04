/**
 * Effects as three lanes (phase 22, Daniel's variant A): Zdroje (always all four resources), Skupiny
 * (anger of the affected groups) and Kraje (affected kraje). Each value has a bar from the middle (right =
 * good for the player, left = bad) in its resource / group colour; ongoing effects sit in their target's
 * lane. Never shows budget chapters.
 */
import type { PreviewRanges } from '@core/effects';
import type { Range } from '@core/types';
import { GROUP_IDS, RESOURCE_IDS } from '@core/types';
import { fmtSigned, t } from '@i18n/index';
import { GROUP_COLOR, RESOURCE_COLOR } from '../colors';
import { mid, rangeText } from '../format';

const MAX_KRAJE = 6;

interface Row {
  key: string;
  label: string;
  color?: string;
  range?: Range;
  /** Anger: up is bad, so the bar and the colour flip. */
  anger?: boolean;
}

function Bar({ r, anger, color, scale }: { r?: Range; anger?: boolean; color?: string; scale: number }) {
  if (!r) return <span className="lane__bar" />;
  const v = mid(r);
  const good = anger ? v < 0 : v > 0;
  const w = Math.min(50, (Math.abs(v) / scale) * 50);
  return (
    <span className="lane__bar">
      <i style={{ [good ? 'left' : 'right']: '50%', width: `${w}%`, background: color }} />
    </span>
  );
}

function Lane({ icon, title, rows, extra }: { icon: string; title: string; rows: Row[]; extra?: React.ReactNode }) {
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
        return (
          <div key={row.key} className="lane__row">
            <span className="lane__label">
              {row.color && <span className="lane__key" style={{ background: row.color }} />}
              {row.label}
            </span>
            <Bar r={row.range} anger={row.anger} color={row.color ?? (good ? 'var(--good-on-paper)' : 'var(--bad-on-paper)')} scale={scale} />
            <span className={`lane__num lane__num--${tone}`}>
              {!row.range ? '–' : `${row.anger ? (v > 0 ? '▲' : '▼') : ''}${rangeText(row.range)}`}
            </span>
          </div>
        );
      })}
      {extra}
    </div>
  );
}

export function EffectLanes({ preview, chaos = 0 }: { preview: PreviewRanges; chaos?: number }) {
  const ongoing = (target: string) =>
    preview.ongoing
      .filter((o) => o.target === target)
      .map((o, i) => (
        <p key={`${target}${i}`} className="lane__ongoing">
          {'↻'} {t('lanes.ongoing', { what: target.startsWith('anger.') ? t(`group.${target.slice(6)}`) : t(`resource.short.${target}`), v: fmtSigned(o.perDay, 2), days: o.days })}
        </p>
      ));
  const resources: Row[] = RESOURCE_IDS.map((r) => ({ key: r, label: t(`resource.short.${r}`), color: RESOURCE_COLOR[r], range: preview.resources[r] }));
  const groups: Row[] = GROUP_IDS.filter((g) => preview.anger[g] || preview.ongoing.some((o) => o.target === `anger.${g}`)).map((g) => ({
    key: g,
    label: t(`group.${g}`),
    color: GROUP_COLOR[g],
    range: preview.anger[g],
    anger: true,
  }));
  const kraje = Object.entries(preview.regions)
    .filter((e): e is [string, Range] => !!e[1])
    .sort((a, b) => Math.abs(mid(b[1])) - Math.abs(mid(a[1])));
  const shown: Row[] = kraje.slice(0, MAX_KRAJE).map(([code, r]) => ({ key: code, label: t(`region.short.${code}`), range: r }));
  const more = kraje.length - shown.length;
  return (
    <div className="lanes">
      <Lane icon="$" title={t('lanes.resources')} rows={resources} extra={RESOURCE_IDS.flatMap((r) => ongoing(r))} />
      <Lane
        icon="☺"
        title={t('lanes.groups')}
        rows={groups}
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
