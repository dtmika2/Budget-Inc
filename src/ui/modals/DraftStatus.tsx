/** Slim status strip above the policy draft (P24): the four attributes and the election projection. */
import type { ResourceId } from '@core/types';
import { RESOURCE_IDS } from '@core/types';
import { fmt, t } from '@i18n/index';
import { RESOURCE_COLOR } from '../colors';
import { useStore } from '../store';

export function DraftStatus() {
  const res = useStore((s) => RESOURCE_IDS.map((r) => Math.round(s.sim?.state.resources[r] ?? 0)), (a, b) => a.every((v, i) => v === b[i]));
  const p = useStore((s) => Math.round((s.sim?.state.projection.P ?? 0) * 100));
  return (
    <p className="draft-status" aria-label={t('draft.status')}>
      <span className="draft-status__label">{t('draft.status')}</span>
      {RESOURCE_IDS.map((r: ResourceId, i) => (
        <span key={r} className="draft-status__item">
          <span className="draft-status__key" style={{ background: RESOURCE_COLOR[r] }} />
          {t(`resource.short.${r}`)} <b>{fmt(res[i])}</b>
        </span>
      ))}
      <span className="draft-status__item">
        {t('hud.projectionShort')} <b>{p} %</b>
      </span>
    </p>
  );
}
