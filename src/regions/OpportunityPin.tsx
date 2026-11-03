import { memo } from 'react';
import type { Pin } from '@core/types';
import { t } from '@i18n/index';
import { getStore, useStore } from '@ui/store';

/** Tappable pin (>= 44 px). The ring drains as the pin's lifetime runs out (updates once per game day). */
export const OpportunityPin = memo(function OpportunityPin({ pin, x, y }: { pin: Pin; x: number; y: number }) {
  const absDay = useStore((s) => (s.sim ? s.sim.absDay : 0));
  const life = Math.max(0, Math.min(1, (pin.expireAbsDay - absDay) / (pin.expireAbsDay - pin.spawnAbsDay)));
  const store = getStore();
  return (
    <button
      className={`pin${life < 0.3 ? ' pin--expiring' : ''}`}
      style={{ left: `${x}%`, top: `${y}%`, ['--life' as string]: life }}
      onClick={() => store.dispatch({ kind: 'collectOpportunity', pinId: pin.id })}
      aria-label={`${t('map.pin')}: ${t(`region.${pin.region}`)}`}
      data-tut-target="pin"
    >
      <span className="pin__ring" aria-hidden="true" />
      <span className="pin__icon" aria-hidden="true">
        {t('map.pinPc')}
      </span>
    </button>
  );
});
