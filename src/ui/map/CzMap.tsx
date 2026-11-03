/**
 * Static SVG map of the 14 kraje (spec §12.4). Each region is a glass filled with party-coloured liquid
 * up to its regional support s_r, with a pixel wave on the surface (Liquid.tsx). The core updates s_r
 * weekly, so the level moves weekly. Outlines on top take the taps.
 * Opportunity pins are HTML buttons laid over the SVG so they stay >= 44 px at any map size.
 */
import { memo } from 'react';
import { fmt, t } from '@i18n/index';
import { getStore, useStore } from '../store';
import { LiquidDefs, LiquidRegion } from './Liquid';
import { OpportunityPin } from './OpportunityPin';
import { MAP_ATTRIBUTION, MAP_HEIGHT, MAP_SCHEMATIC, MAP_WIDTH, REGION_PATHS } from './regionsPath';

const LABEL_BY_CODE = new Map(REGION_PATHS.map((r) => [r.code, r]));

const Regions = memo(function Regions({
  support,
  party,
  light,
  selected,
}: {
  support: Record<string, number>;
  party: string;
  light: string;
  selected: string | null;
}) {
  const store = getStore();
  return (
    <>
      <LiquidDefs prefix="game" color={party} light={light} />
      {REGION_PATHS.map((r) => (
        <LiquidRegion key={r.code} prefix="game" code={r.code} d={r.d} support={support[r.code] ?? 0} color={party} />
      ))}
      {REGION_PATHS.map((r) => (
        <path
          key={r.code}
          d={r.d}
          className={`region region--outline${selected === r.code ? ' is-selected' : ''}`}
          fill="transparent"
          fillRule="evenodd"
          onClick={() => store.setUi({ selectedRegion: store.ui.selectedRegion === r.code ? null : r.code })}
        >
          <title>{t(`region.${r.code}`)}</title>
        </path>
      ))}
    </>
  );
});

function RegionInfo() {
  const store = getStore();
  const code = useStore((s) => s.ui.selectedRegion);
  const support = useStore((s) => (code ? (s.sim?.state.projection.regionSupport[code] ?? 0) : 0));
  if (!code || !store.data) return null;
  const region = store.data.regions.regions.find((r) => r.code === code);
  if (!region) return null;
  const total = store.data.regions.regions.reduce((s, r) => s + r.seats, 0);
  return (
    <div className="region-info" role="status">
      <b>{t(region.name)}</b>
      <span>{t('map.support', { v: fmt(support) })}</span>
      <span>{t('map.seats', { seats: region.seats, w: fmt(region.seats / total, 3) })}</span>
      <button className="btn-icon" onClick={() => store.setUi({ selectedRegion: null })} aria-label={t('common.close')}>
        {'✕'}
      </button>
    </div>
  );
}

function Pins() {
  const pins = useStore((s) => (s.sim ? [...s.sim.state.pins] : []));
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
    </div>
  );
}

export function CzMap() {
  const support = useStore((s) => s.sim?.state.projection.regionSupport ?? {});
  const party = useStore((s) => s.sim?.leaderDef.color ?? '#888888');
  const light = useStore((s) => s.sim?.leaderDef.colorLight ?? '#cccccc');
  const selected = useStore((s) => s.ui.selectedRegion);
  return (
    <div className="map" data-tut-target="map">
      <div className="map__frame" style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}>
        <svg viewBox={`-6 -6 ${MAP_WIDTH + 12} ${MAP_HEIGHT + 12}`} className="map__svg" role="img" aria-label={t('hud.projection')}>
          <Regions support={support} party={party} light={light} selected={selected} />
        </svg>
        <Pins />
      </div>
      <RegionInfo />
      <p className="map__credit">{MAP_SCHEMATIC ? t('map.schematic') : MAP_ATTRIBUTION ? t('map.attribution') : ''}</p>
    </div>
  );
}
