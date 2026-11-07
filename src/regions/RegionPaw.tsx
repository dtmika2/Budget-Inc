/**
 * Region paw (regions workspace): a click on a kraj without an open event or demand opens four pads over the
 * click point instead of the region screen. The big pad under the click opens the Hlavni tab, the three toes
 * above open Akce, Udalosti and Data. Akce and Udalosti carry a count in the corner: the kraj actions that can
 * be done right now, and the open events, demands and pledges here. Esc or a press outside closes it.
 */
import { useEffect, useRef } from 'react';
import { canDoRegionAction, offeredActions } from '@core/regionActions';
import { t } from '@i18n/index';
import { iconRects } from '@ui/abilityIcons';
import { getStore, useStore, type RegionTab } from '@ui/store';

export type Paw = { code: string; x: number; y: number };

/** 10 x 10 pixel icons (letters from the ability icon palette). */
const ICONS: Record<'actions' | 'events' | 'data', string[]> = {
  // a hammer
  actions: ['..KKKKKK..', '..KXXXXKK.', '..KXXXXKK.', '..KKKKKK..', '....KTK...', '....KTK...', '....KTK...', '....KTK...', '....KTK...', '....KKK...'],
  // a warning sign
  events: ['....KK....', '...KGGK...', '...KGGK...', '..KGKKGK..', '..KGKKGK..', '.KGGKKGGK.', '.KGGGGGGK.', 'KGGGKKGGGK', 'KGGGGGGGGK', 'KKKKKKKKKK'],
  // a bar chart
  data: ['K.........', 'K.......EE', 'K.......EE', 'K....BB.EE', 'K....BB.EE', 'K....BB.EE', 'K.RR.BB.EE', 'K.RR.BB.EE', 'K.RR.BB.EE', 'KKKKKKKKKK'],
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg className="paw__icon" viewBox="0 0 10 10" width={20} height={20} shapeRendering="crispEdges" aria-hidden="true">
      {iconRects(ICONS[name]).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}

export function RegionPaw({ paw, onClose }: { paw: Paw; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { code } = paw;
  const actions = useStore((s) => (s.sim ? offeredActions(s.sim, code).filter((a) => canDoRegionAction(s.sim!, code, a.id) === null).length : 0));
  const events = useStore((s) => {
    const st = s.sim?.state;
    if (!st) return 0;
    return st.regionEvents.filter((e) => e.region === code).length + st.demands.filter((d) => d.region === code).length + st.pledges.filter((p) => p.region === code).length;
  });

  // Esc or a press anywhere outside the paw closes it (a press on another kraj then opens a new paw there)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const go = (tab: RegionTab) => {
    onClose();
    getStore().setUi({ selectedRegion: code, regionTab: tab });
  };
  const toe = (tab: 'actions' | 'events' | 'data', count?: number) => {
    const label = t(`region.screen.tab.${tab}`);
    return (
      <button
        className={`paw__pad paw__toe paw__toe--${tab}`}
        onClick={() => go(tab)}
        aria-label={count === undefined ? label : `${label} (${count})`}
        title={label}
      >
        <span className="paw__face">
          <Icon name={tab} />
          <span className="paw__label">{label}</span>
        </span>
        {count !== undefined && (
          <span className={`paw__badge paw__badge--${tab}${count === 0 ? ' is-zero' : ''}`} aria-hidden="true">
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div ref={ref} className="paw" style={{ left: paw.x, top: paw.y }} role="group" aria-label={t(`region.${code}`)}>
      {toe('actions', actions)}
      {toe('events', events)}
      {toe('data')}
      <button className="paw__pad paw__main" onClick={() => go('main')}>
        <span className="paw__face">{t('region.screen.tab.main')}</span>
      </button>
      <span className="paw__caption" aria-hidden="true">
        {t(`region.${code}`)}
      </span>
    </div>
  );
}
