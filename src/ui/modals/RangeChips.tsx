/** Expected-effect ranges after modifiers (spec §6.3). Never shows budget chapters — only consequences. */
import type { PreviewRanges } from '@core/effects';
import type { Range } from '@core/types';
import { GROUP_IDS, RESOURCE_IDS } from '@core/types';
import { fmtSigned, t } from '@i18n/index';
import { mid, rangeText, tone } from '../format';

interface Props {
  preview: PreviewRanges;
  /** Show all 4 resources, including unaffected ones (cards). */
  all?: boolean;
  compact?: boolean;
}

function chip(key: string, label: string, r: Range | undefined, anger: boolean, compact: boolean) {
  if (!r) return null;
  const tn = tone(mid(r), anger);
  const arrow = anger ? (mid(r) > 0 ? '▲' : '▼') : '';
  return (
    <li key={key} className={`chip chip--${tn}`}>
      <span className="chip__label">{label}</span>
      <span className="chip__value">
        {arrow}
        {compact ? rangeText(r) : rangeText(r)}
      </span>
    </li>
  );
}

export function RangeChips({ preview, all = false, compact = false }: Props) {
  const res = RESOURCE_IDS.map((r) => {
    const range = preview.resources[r];
    if (!range && !all) return null;
    if (!range)
      return (
        <li key={r} className="chip chip--neutral">
          <span className="chip__label">{t(`resource.short.${r}`)}</span>
          <span className="chip__value">0</span>
        </li>
      );
    return chip(r, t(`resource.short.${r}`), range, false, compact);
  });
  const anger = GROUP_IDS.map((g) => chip(`a-${g}`, t(`group.${g}`), preview.anger[g], true, compact));
  const hasAnger = GROUP_IDS.some((g) => preview.anger[g]);
  return (
    <div className={`ranges${compact ? ' ranges--compact' : ''}`}>
      <ul className="ranges__res">{res}</ul>
      {hasAnger && <ul className="ranges__anger">{anger}</ul>}
      {preview.pc > 0 && <p className="ranges__pc">+{t('common.pc', { n: preview.pc })}</p>}
      {preview.ongoing.map((o, i) => (
        <p key={i} className="ranges__ongoing">
          <span className="ongoing-icon" aria-hidden="true">
            {'↻'}
          </span>
          {t('draft.ongoingLine', {
            target: o.target.startsWith('anger.') ? t(`group.${o.target.slice(6)}`) : t(`resource.short.${o.target}`),
            v: fmtSigned(o.perDay, 2),
            days: o.days,
          })}
        </p>
      ))}
    </div>
  );
}
