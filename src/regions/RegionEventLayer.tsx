/**
 * Second map layer (regions workspace): while a region event is open, an animation covers its whole kraj
 * (flood, blackout, demonstrations, factory shutdown, the Ikonicke duo) so the player notices it and opens
 * the region. Drawn inside the map SVG, under the highlight outlines; ignores pointer events. Sprites come
 * from the living map's <defs> (MapLife.tsx); the global reduced-motion switch freezes the CSS loops.
 */
import { memo } from 'react';
import type { OpenRegionEvent, RegionEventAnimation } from '@core/types';
import { useStore } from '@ui/store';
import { hash, JACKETS, PLACARD, Sprite, spot, type Vars } from './MapLife';
import { REGION_PATHS } from './regionsPath';
import { SPX } from './sprites';

const PATHS = new Map(REGION_PATHS.map((r) => [r.code, r.d]));

/** Positions inside the kraj, stable per event (u, v in [-1, 1]). */
function spots(ev: OpenRegionEvent, n: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const h = hash(`${ev.id}:${i}`);
    return spot(ev.region, ((h % 1000) / 500 - 1) * 0.9, (((h >>> 10) % 1000) / 500 - 1) * 0.9, 0.26);
  });
}

const at = (p: { x: number; y: number }, child: React.ReactNode, key: number | string) => (
  <g key={key} transform={`translate(${p.x} ${p.y})`}>
    {child}
  </g>
);

function Flood({ ev, d }: { ev: OpenRegionEvent; d: string }) {
  return (
    <g>
      <path d={d} fillRule="evenodd" className="rev-fill rev-fill--flood" />
      {spots(ev, 4).map((p, i) => at(p, <g className="rev-bob" style={{ animationDelay: `${i * 0.35}s` }}><Sprite name="wave" style={{ '--fr': '0.7s' }} /></g>, i))}
    </g>
  );
}

function Blackout({ ev, d }: { ev: OpenRegionEvent; d: string }) {
  const [p] = spots(ev, 1);
  return (
    <g>
      <path d={d} fillRule="evenodd" className="rev-fill rev-fill--dark" />
      {at(
        p,
        <>
          <Sprite name="pylon" />
          <g transform={`translate(${7 * SPX} ${-8 * SPX})`} className="life-zap">
            <Sprite name="bolt" />
          </g>
        </>,
        'p',
      )}
    </g>
  );
}

function Protest({ ev, d }: { ev: OpenRegionEvent; d: string }) {
  const crowd = spots(ev, 5);
  return (
    <g>
      <path d={d} fillRule="evenodd" className="rev-fill rev-fill--protest" />
      {crowd.map((p, i) =>
        at(p, <g className="rev-march" style={{ animationDelay: `${i * 0.2}s` }}><Sprite name="protester" style={{ '--placard': PLACARD.chaos, '--jacket': JACKETS[i % JACKETS.length], '--fr': '0.5s' }} /></g>, i),
      )}
      {at({ x: crowd[0].x, y: crowd[0].y - 14 * SPX }, <g className="life-blink"><Sprite name="shout" /></g>, 's')}
    </g>
  );
}

function Factory({ ev, d }: { ev: OpenRegionEvent; d: string }) {
  return (
    <g>
      <path d={d} fillRule="evenodd" className="rev-fill rev-fill--factory" />
      {spots(ev, 2).map((p, i) =>
        at(
          p,
          <>
            <Sprite name="factory" />
            <g transform={`translate(${2 * SPX} ${-12 * SPX})`} className="rev-rise" style={{ animationDelay: `${i * 0.6}s` }}>
              <Sprite name="smoke" style={{ '--fr': '0.9s' }} />
            </g>
          </>,
          i,
        ),
      )}
    </g>
  );
}

/** Meman in a grey coat, Vlaus in navy (presentation only; the text names the visitor). */
const DUO_JACKET: Record<string, string> = { meman: '#7a6a58', vlaus: '#2c3e6b' };

function Duo({ ev, d }: { ev: OpenRegionEvent; d: string }) {
  const [p] = spots(ev, 1);
  return (
    <g>
      <path d={d} fillRule="evenodd" className="rev-fill rev-fill--duo" />
      {at(
        p,
        <>
          <Sprite name="carpet" />
          <g transform={`translate(${-3 * SPX} ${-2 * SPX})`} className="rev-wave-hand">
            <Sprite name="vip" style={{ '--jacket': DUO_JACKET[ev.variant ?? ''] ?? JACKETS[0], '--fr': '0.6s' } as Vars} />
          </g>
          <g transform={`translate(${6 * SPX} ${-14 * SPX})`} className="life-blink">
            <Sprite name="shout" />
          </g>
        </>,
        'p',
      )}
    </g>
  );
}

const VIEWS: Record<RegionEventAnimation, (p: { ev: OpenRegionEvent; d: string }) => React.ReactElement> = {
  flood: Flood,
  blackout: Blackout,
  protest: Protest,
  factory: Factory,
  duo: Duo,
};

export const RegionEventLayer = memo(function RegionEventLayer() {
  const events = useStore((s) => (s.sim ? [...s.sim.state.regionEvents] : []));
  const templates = useStore((s) => s.sim?.data.regionEvents ?? []);
  return (
    <g className="rev-layer" aria-hidden="true">
      {events.map((ev) => {
        const d = PATHS.get(ev.region);
        const animation = templates.find((t) => t.id === ev.templateId)?.animation;
        const View = animation && VIEWS[animation];
        return d && View ? <View key={ev.id} ev={ev} d={d} /> : null;
      })}
    </g>
  );
});
