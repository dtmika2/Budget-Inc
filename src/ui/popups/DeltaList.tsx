import type { Deltas, GroupId, ResourceId } from '@core/types';
import { GROUP_IDS, RESOURCE_IDS } from '@core/types';
import { fmtSigned, t } from '@i18n/index';
import { tone } from '../format';

/** Compact list of applied changes (resource / anger / PC deltas). */
export function DeltaList({ deltas }: { deltas: Deltas }) {
  const items: { key: string; label: string; v: number; anger: boolean }[] = [];
  for (const r of RESOURCE_IDS) {
    const v = deltas.resources[r as ResourceId];
    if (v && Math.abs(v) >= 0.05) items.push({ key: r, label: t(`resource.short.${r}`), v, anger: false });
  }
  for (const g of GROUP_IDS) {
    const v = deltas.anger[g as GroupId];
    if (v && Math.abs(v) >= 0.05) items.push({ key: g, label: t(`group.${g}`), v, anger: true });
  }
  for (const [code, v] of Object.entries(deltas.regions ?? {})) {
    if (v && Math.abs(v) >= 0.05) items.push({ key: `r-${code}`, label: t(`region.short.${code}`), v, anger: false });
  }
  if (deltas.pc) items.push({ key: 'pc', label: t('hud.pc'), v: deltas.pc, anger: false });
  if (!items.length) return null;
  return (
    <span className="deltas">
      {items.map((i) => (
        <span key={i.key} className={`delta delta--${tone(i.v, i.anger)}`}>
          {i.label} {i.anger ? (i.v > 0 ? '▲' : '▼') : ''}
          {fmtSigned(i.v, Math.abs(i.v) < 1 ? 1 : 0)}
        </span>
      ))}
    </span>
  );
}
