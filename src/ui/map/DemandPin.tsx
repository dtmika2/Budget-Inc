import { memo } from 'react';
import type { OpenDemand } from '@core/types';
import { t } from '@i18n/index';
import { getStore, useStore } from '../store';

/** Regional demand pin: a red speech bubble with "!" (the PC bubble has its own icon). Opens the region. */
export const DemandPin = memo(function DemandPin({ demand, x, y }: { demand: OpenDemand; x: number; y: number }) {
  const absDay = useStore((s) => (s.sim ? s.sim.absDay : 0));
  const life = Math.max(0, Math.min(1, (demand.expireAbsDay - absDay) / (demand.expireAbsDay - demand.spawnAbsDay)));
  return (
    <button
      className={`dpin${life < 0.3 ? ' dpin--expiring' : ''}`}
      style={{ left: `${x}%`, top: `${y}%`, ['--life' as string]: life }}
      onClick={() => getStore().setUi({ selectedRegion: demand.region })}
      aria-label={`${t('map.demand')}: ${t(`region.${demand.region}`)}`}
    >
      <span className="dpin__bubble" aria-hidden="true">
        !
      </span>
      <span className="dpin__life" aria-hidden="true" />
    </button>
  );
});
