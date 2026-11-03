/**
 * Liquid fill for map regions: each kraj is a glass clipped to its own shape, filled with the party
 * colour up to its support level (0–100 % of the region's height). The surface is a two-layer pixel wave
 * (stepped 4-unit columns) that scrolls in whole-pixel steps; the level steps up/down when support changes.
 * Reduced motion stops the waves and the level animation (global CSS rule).
 */
import { memo } from 'react';
import { REGION_PATHS } from './regionsPath';

const PX = 6; // pixel size in map units
export const WAVE_LEN = 16 * PX; // one wave period: 16 pixel columns (CSS scrolls by this, in 16 steps)
const TILE_H = 6 * PX; // wave tile height

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bounding box of an SVG path made of absolute M/L/Z commands (as produced by build-map.ts). */
export function pathBox(d: string): Box {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    x0 = Math.min(x0, nums[i]);
    x1 = Math.max(x1, nums[i]);
    y0 = Math.min(y0, nums[i + 1]);
    y1 = Math.max(y1, nums[i + 1]);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const REGION_BOXES: Record<string, Box> = Object.fromEntries(REGION_PATHS.map((r) => [r.code, pathBox(r.d)]));

/** Surface y for a support value: 0 = empty (below the region), 100 = brim. */
export function levelY(box: Box, support: number): number {
  const s = Math.min(100, Math.max(0, support)) / 100;
  return box.y + box.h * (1 - s) + (s === 0 ? TILE_H : 0);
}

function columns(phase: number): number[] {
  // heights in pixels (2..6) following a sine, quantised to whole pixels
  return Array.from({ length: WAVE_LEN / PX }, (_, i) => 2 + Math.round(2 * (1 + Math.sin((2 * Math.PI * i) / (WAVE_LEN / PX) + phase))));
}

/** Shared wave patterns for one map instance (ids are prefixed so two maps can coexist). */
export const LiquidDefs = memo(function LiquidDefs({ prefix, color, light }: { prefix: string; color: string; light: string }) {
  const front = columns(0);
  const back = columns(Math.PI * 0.9);
  return (
    <defs>
      <pattern id={`${prefix}-wave-front`} patternUnits="userSpaceOnUse" width={WAVE_LEN} height={TILE_H} shapeRendering="crispEdges">
        {front.map((n, i) => (
          <g key={i}>
            <rect x={i * PX} y={TILE_H - n * PX} width={PX} height={n * PX} fill={color} />
            <rect x={i * PX} y={TILE_H - n * PX} width={PX} height={PX} fill={light} />
          </g>
        ))}
      </pattern>
      <pattern id={`${prefix}-wave-back`} patternUnits="userSpaceOnUse" width={WAVE_LEN} height={TILE_H} shapeRendering="crispEdges">
        {back.map((n, i) => (
          <rect key={i} x={i * PX} y={TILE_H - n * PX - PX} width={PX} height={n * PX + PX} fill={light} />
        ))}
      </pattern>
      {REGION_PATHS.map((r) => (
        <clipPath key={r.code} id={`${prefix}-clip-${r.code}`}>
          <path d={r.d} fillRule="evenodd" />
        </clipPath>
      ))}
    </defs>
  );
});

/** One region's glass + liquid. `support` drives the level. */
export const LiquidRegion = memo(function LiquidRegion({
  prefix,
  code,
  d,
  support,
  color,
}: {
  prefix: string;
  code: string;
  d: string;
  support: number;
  color: string;
}) {
  const box = REGION_BOXES[code];
  const y = levelY(box, support);
  const span = box.w + 2 * WAVE_LEN;
  return (
    <g clipPath={`url(#${prefix}-clip-${code})`}>
      <path d={d} fillRule="evenodd" className="glass" />
      <g className="liquid" style={{ transform: `translateY(${y}px)` }} shapeRendering="crispEdges">
        <rect className="wave wave--back" x={box.x - WAVE_LEN} y={-TILE_H} width={span} height={TILE_H} fill={`url(#${prefix}-wave-back)`} opacity={0.55} />
        <rect className="wave wave--front" x={box.x - WAVE_LEN} y={-TILE_H} width={span} height={TILE_H} fill={`url(#${prefix}-wave-front)`} />
        <rect x={box.x - PX} y={-0.5} width={box.w + 2 * PX} height={box.h + TILE_H + 8} fill={color} />
      </g>
    </g>
  );
});
