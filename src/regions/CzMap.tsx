/**
 * Static SVG map of the 14 kraje (spec §12.4). Each region is a mustard glass filled with wine or beer
 * up to its regional support s_r, with a pixel wave on the surface (Liquid.tsx). The core updates s_r
 * weekly, so the level moves weekly. Outlines on top take the taps.
 * Opportunity pins are HTML buttons laid over the SVG so they stay >= 44 px at any map size.
 */
import { memo, useState } from 'react';
import { t } from '@i18n/index';
import { PixelIcon } from '@ui/pixelIcons';
import { getStore, useStore } from '@ui/store';
import { LiquidDefs, LiquidRegion } from './Liquid';
import { MapLife } from './MapLife';
import { Floaters } from '@ui/popups/Floaters';
import { DemandPin } from './DemandPin';
import { RegionEventLayer } from './RegionEventLayer';
import { RegionEventPin } from './RegionEventPin';
import { OpportunityPin } from './OpportunityPin';
import { MAP_HEIGHT, MAP_WIDTH, REGION_PATHS } from './regionsPath';

const LABEL_BY_CODE = new Map(REGION_PATHS.map((r) => [r.code, r]));

const Regions = memo(function Regions({ support, selected }: { support: Record<string, number>; selected: string | null }) {
  const store = getStore();
  const [hovered, setHovered] = useState<string | null>(null);
  // SVG has no z-index: a highlighted outline drawn in list order is covered by later neighbours'
  // borders. So highlights are separate paths painted after all outlines (hover below selection).
  const highlights = [hovered !== selected ? hovered : null, selected].filter((c): c is string => !!c);
  return (
    <>
      <LiquidDefs prefix="game" />
      {REGION_PATHS.map((r) => (
        <LiquidRegion key={r.code} prefix="game" code={r.code} d={r.d} support={support[r.code] ?? 0} />
      ))}
      {REGION_PATHS.map((r) => (
        <path
          key={r.code}
          d={r.d}
          className="region region--outline"
          fill="transparent"
          fillRule="evenodd"
          // a kraj with an open event or demand acts like its map pin
          onClick={() => {
            const open = store.sim?.state;
            const waiting = open?.regionEvents.some((e) => e.region === r.code) || open?.demands.some((d) => d.region === r.code);
            store.setUi({ selectedRegion: r.code, regionTab: waiting ? 'events' : 'main' });
          }}
          onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(r.code)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setHovered((h) => (h === r.code ? null : h))}
        >
          <title>{t(`region.${r.code}`)}</title>
        </path>
      ))}
      <MapLife />
      <RegionEventLayer />
      {highlights.map((code) => (
        <path
          key={`hl-${code}`}
          d={LABEL_BY_CODE.get(code)!.d}
          fillRule="evenodd"
          className={`region-highlight${code === selected ? ' is-selected' : ''}`}
          aria-hidden="true"
        />
      ))}
    </>
  );
});

function Pins() {
  const pins = useStore((s) => (s.sim ? [...s.sim.state.pins] : []));
  const demands = useStore((s) => (s.sim ? [...s.sim.state.demands] : []));
  const regionEvents = useStore((s) => (s.sim ? [...s.sim.state.regionEvents] : []));
  const pledgeRegions = useStore((s) => (s.sim ? [...new Set(s.sim.state.pledges.map((p) => p.region))] : []));
  return (
    <div className="pins">
      {pins.map((p) => {
        const r = LABEL_BY_CODE.get(p.region);
        if (!r) return null;
        // small deterministic offset so several pins in one region do not overlap
        const n = Number(p.id.replace(/\D/g, '')) || 0;
        const dx = ((n * 37) % 5) * 8 - 16;
        const dy = ((n * 53) % 3) * 10 - 10;
        return <OpportunityPin key={p.id} pin={p} x={((r.labelX + dx) / MAP_WIDTH) * 100} y={((r.labelY + dy) / MAP_HEIGHT) * 100} />;
      })}
      {demands.map((d) => {
        const r = LABEL_BY_CODE.get(d.region);
        if (!r) return null;
        return <DemandPin key={d.id} demand={d} x={((r.labelX + 22) / MAP_WIDTH) * 100} y={((r.labelY - 30) / MAP_HEIGHT) * 100} />;
      })}
      {regionEvents.map((e) => {
        const r = LABEL_BY_CODE.get(e.region);
        if (!r) return null;
        return <RegionEventPin key={e.id} ev={e} x={((r.labelX - 4) / MAP_WIDTH) * 100} y={((r.labelY - 40) / MAP_HEIGHT) * 100} />;
      })}
      {pledgeRegions.map((code) => {
        const r = LABEL_BY_CODE.get(code);
        if (!r) return null;
        return (
          <span key={`pl-${code}`} className="pledge-mark" style={{ left: `${((r.labelX - 22) / MAP_WIDTH) * 100}%`, top: `${((r.labelY - 26) / MAP_HEIGHT) * 100}%` }} aria-hidden="true">
            <PixelIcon name="hourglass" />
          </span>
        );
      })}
    </div>
  );
}

/** Floating +/- numbers over regions whose support shifted (the level itself updates weekly). */
function RegionFloaters() {
  return (
    <div className="region-floaters" aria-hidden="true">
      {REGION_PATHS.map((r) => (
        <span key={r.code} className="region-floater" style={{ left: `${(r.labelX / MAP_WIDTH) * 100}%`, top: `${(r.labelY / MAP_HEIGHT) * 100}%` }}>
          <Floaters k={`region.${r.code}`} />
        </span>
      ))}
    </div>
  );
}

/** A pixel banner sweeps across the map when a new quarter starts (remounts per quarter). */
function QuarterBanner() {
  const q = useStore((s) => s.sim?.state.quarter ?? 0);
  const reduced = useStore((s) => s.ui.settings.reducedMotion);
  if (!q || reduced) return null;
  return (
    <div key={q} className="quarter-banner" aria-hidden="true">
      <span>{t('map.quarterBanner', { q, y: Math.ceil(q / 4) })}</span>
    </div>
  );
}

export function CzMap() {
  const support = useStore((s) => s.sim?.state.projection.regionSupport ?? {});
  const selected = useStore((s) => s.ui.selectedRegion);
  return (
    <div className="map" data-tut-target="map">
      <div className="map__frame" style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}>
        <svg viewBox={`-6 -6 ${MAP_WIDTH + 12} ${MAP_HEIGHT + 12}`} className="map__svg" role="img" aria-label={t('hud.projection')}>
          <Regions support={support} selected={selected} />
        </svg>
        <RegionFloaters />
        <QuarterBanner />
        <Pins />
      </div>
    </div>
  );
}
