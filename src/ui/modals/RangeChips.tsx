/** Expected-effect ranges after modifiers (spec §6.3). Never shows budget chapters — only consequences. */
import type { PreviewRanges } from '@core/effects';
import type { Range } from '@core/types';
import { GROUP_IDS, RESOURCE_IDS } from '@core/types';
import { fmtSigned, t } from '@i18n/index';
import { GROUP_COLOR, RESOURCE_COLOR } from '../colors';
import { mid, rangeText, tone } from '../format';
import { PixelIcon } from '../pixelIcons';

interface Props {
  preview: PreviewRanges;
  /** Show all 4 resources, including unaffected ones (cards). */
  all?: boolean;
  compact?: boolean;
  /** With more affected kraje than this, show one summary chip (range over all of them) instead of one each. */
  groupRegions?: number;
}

function chip(key: string, label: string, r: Range | undefined, anger: boolean, compact: boolean, color?: string) {
  if (!r) return null;
  const tn = tone(mid(r), anger);
  const arrow = anger ? (mid(r) > 0 ? '▲' : '▼') : '';
  return (
    <li key={key} className={`chip chip--${tn}`} style={color ? { ['--chip-c' as string]: color } : undefined}>
      <span className={`chip__label${color ? ' chip__label--key' : ''}`}>{label}</span>
      <span className="chip__value">
        {arrow}
        {compact ? rangeText(r) : rangeText(r)}
      </span>
    </li>
  );
}

export function RangeChips({ preview, all = false, compact = false, groupRegions }: Props) {
  const res = RESOURCE_IDS.map((r) => {
    const range = preview.resources[r];
    if (!range && !all) return null;
    if (!range)
      return (
        <li key={r} className="chip chip--neutral" style={{ ['--chip-c' as string]: RESOURCE_COLOR[r] }}>
          <span className="chip__label chip__label--key">{t(`resource.short.${r}`)}</span>
          <span className="chip__value">0</span>
        </li>
      );
    return chip(r, t(`resource.short.${r}`), range, false, compact, RESOURCE_COLOR[r]);
  });
  const anger = GROUP_IDS.map((g) => chip(`a-${g}`, t(`group.${g}`), preview.anger[g], true, compact, GROUP_COLOR[g]));
  const hasAnger = GROUP_IDS.some((g) => preview.anger[g]);
  const regionCodes = Object.keys(preview.regions ?? {});
  const grouped = groupRegions !== undefined && regionCodes.length > groupRegions;
  return (
    <div className={`ranges${compact ? ' ranges--compact' : ''}`}>
      <ul className="ranges__res">{res}</ul>
      {hasAnger && <ul className="ranges__anger">{anger}</ul>}
      {regionCodes.length > 0 && (
        <ul className="ranges__regions" aria-label={t('draft.regions')} title={grouped ? regionCodes.map((c) => t(`region.short.${c}`)).join(', ') : undefined}>
          {grouped
            ? [true, false].map((up) => {
                // gains and losses summarised separately, so one chip never mixes signs
                const codes = regionCodes.filter((c) => mid(preview.regions[c]!) > 0 === up);
                return codes.length ? chip(`r-${up}`, t('draft.regionsN', { n: codes.length }), spanOf(codes.map((c) => preview.regions[c]!)), false, compact) : null;
              })
            : regionCodes.map((code) => chip(`r-${code}`, t(`region.short.${code}`), preview.regions[code], false, compact))}
        </ul>
      )}
      {preview.pc > 0 && <p className="ranges__pc">+{t('common.pc', { n: preview.pc })}</p>}
      {preview.ongoing.map((o, i) => (
        <p key={i} className="ranges__ongoing">
          <span className="ongoing-icon" aria-hidden="true">
            <PixelIcon name="repeat" size={10} />
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

/** Range covering every given range (lowest min .. highest max). */
function spanOf(rs: Range[]): Range {
  return { min: Math.min(...rs.map((r) => r.min)), max: Math.max(...rs.map((r) => r.max)) };
}
