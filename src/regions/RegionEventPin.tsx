import { memo } from 'react';
import type { OpenRegionEvent } from '@core/types';
import { t } from '@i18n/index';
import { getStore, useStore } from '@ui/store';

/** Region event pin: a red "!" bubble over a kraj with an open event. Opens the region on its events tab. */
export const RegionEventPin = memo(function RegionEventPin({ ev, x, y }: { ev: OpenRegionEvent; x: number; y: number }) {
  const absDay = useStore((s) => (s.sim ? s.sim.absDay : 0));
  const title = useStore((s) => s.sim?.data.regionEvents.find((tpl) => tpl.id === ev.templateId)?.title ?? '');
  const life = Math.max(0, Math.min(1, (ev.expireAbsDay - absDay) / (ev.expireAbsDay - ev.spawnAbsDay)));
  return (
    <button
      className={`dpin dpin--event${life < 0.3 ? ' dpin--expiring' : ''}`}
      style={{ left: `${x}%`, top: `${y}%`, ['--life' as string]: life }}
      onClick={() => getStore().setUi({ selectedRegion: ev.region, regionTab: 'events' })}
      aria-label={`${t(title)}: ${t(`region.${ev.region}`)}`}
    >
      <span className="dpin__bubble" aria-hidden="true">
        !
      </span>
      <span className="dpin__life" aria-hidden="true" />
    </button>
  );
});
