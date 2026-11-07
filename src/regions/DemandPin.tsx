import { memo } from 'react';
import type { OpenDemand } from '@core/types';
import { t } from '@i18n/index';
import { PixelIcon } from '@ui/pixelIcons';
import { getStore, useStore } from '@ui/store';

/** Regional demand pin: an amber speech bubble with a petition. Opens the region on its events tab. */
export const DemandPin = memo(function DemandPin({ demand, x, y }: { demand: OpenDemand; x: number; y: number }) {
  const absDay = useStore((s) => (s.sim ? s.sim.absDay : 0));
  const life = Math.max(0, Math.min(1, (demand.expireAbsDay - absDay) / (demand.expireAbsDay - demand.spawnAbsDay)));
  return (
    <button
      className={`dpin dpin--demand${life < 0.3 ? ' dpin--expiring' : ''}`}
      style={{ left: `${x}%`, top: `${y}%`, ['--life' as string]: life }}
      onClick={() => getStore().setUi({ selectedRegion: demand.region, regionTab: 'events' })}
      aria-label={`${t('map.demand')}: ${t(`region.${demand.region}`)}`}
    >
      <span className="dpin__bubble" aria-hidden="true">
        <PixelIcon name="petition" />
      </span>
      <span className="dpin__life" aria-hidden="true" />
    </button>
  );
});
