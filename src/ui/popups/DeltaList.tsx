import type { Deltas, GroupId, ResourceId } from '@core/types';
import { GROUP_IDS, RESOURCE_IDS } from '@core/types';
import { fmtSigned, t } from '@i18n/index';
import { GROUP_COLOR, RESOURCE_COLOR } from '../colors';
import { tone } from '../format';

/**
 * Compact list of applied changes (history, pop-ups). Resources and groups carry their colour key; more
 * than two affected kraje collapse into one item per direction ("Kraje (5) +2"), so a row stays short.
 */
export function DeltaList({ deltas }: { deltas: Deltas }) {
  const items: { key: string; label: string; v: number; anger: boolean; color?: string }[] = [];
  for (const r of RESOURCE_IDS) {
    const v = deltas.resources[r as ResourceId];
    if (v && Math.abs(v) >= 0.05) items.push({ key: r, label: t(`resource.short.${r}`), v, anger: false, color: RESOURCE_COLOR[r] });
  }
  for (const g of GROUP_IDS) {
    const v = deltas.anger[g as GroupId];
    if (v && Math.abs(v) >= 0.05) items.push({ key: g, label: t(`group.${g}`), v, anger: true, color: GROUP_COLOR[g] });
  }
  const regions = Object.entries(deltas.regions ?? {}).filter(([, v]) => v && Math.abs(v) >= 0.05) as [string, number][];
  if (regions.length > 2) {
    for (const up of [true, false]) {
      const vs = regions.filter(([, v]) => v > 0 === up).map(([, v]) => v);
      if (vs.length) items.push({ key: `r-${up}`, label: t('draft.regionsN', { n: vs.length }), v: vs.reduce((a, b) => a + b, 0) / vs.length, anger: false });
    }
  } else for (const [code, v] of regions) items.push({ key: `r-${code}`, label: t(`region.short.${code}`), v, anger: false });
  if (deltas.pc) items.push({ key: 'pc', label: t('hud.pc'), v: deltas.pc, anger: false });
  if (!items.length) return null;
  return (
    <span className="deltas">
      {items.map((i) => (
        <span key={i.key} className={`delta delta--${tone(i.v, i.anger)}${i.color ? ' delta--key' : ''}`} style={i.color ? { ['--chip-c' as string]: i.color } : undefined}>
          {i.label} {i.anger ? (i.v > 0 ? '▲' : '▼') : ''}
          {fmtSigned(i.v, Math.abs(i.v) < 1 ? 1 : 0)}
        </span>
      ))}
    </span>
  );
}
