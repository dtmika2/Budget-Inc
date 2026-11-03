/**
 * Liquid fill for map regions: each kraj is a mustard-beige glass clipped to its own shape, filled with
 * wine-red liquid up to its support level (0–100 % of the region's height). The surface is a two-layer
 * pixel wave with an irregular profile (several harmonics + occasional spray pixels) that scrolls in
 * whole-pixel steps; each region gets its own offset, speed and phase so neighbours never move in
 * lockstep. The level steps up/down when support changes. Reduced motion stops all of it (global CSS).
 */
import { memo, type CSSProperties } from 'react';
import { REGION_PATHS } from './regionsPath';

export const PX = 6; // pixel size in map units
const FRONT_COLS = 48; // front wave period in pixel columns (keep in sync with CSS keyframes: 48 * 6 = 288)
const BACK_COLS = 40; // back wave period in pixel columns (keep in sync with CSS keyframes: 40 * 6 = 240)
const ROWS = 9; // tile height in pixels (max crest + spray)
const TILE_H = ROWS * PX;

export const LIQUID = {
  body: '#6b1430',
  crest: '#a8334f',
  back: '#8a2241',
  spray: '#c25a72',
};

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

/**
 * Irregular but seamless profile: integer harmonics of the period keep the tile tileable, mixed
 * amplitudes and phases break the uniform sine look. Heights in whole pixels.
 */
function profile(cols: number, harmonics: [number, number, number][], base: number): number[] {
  return Array.from({ length: cols }, (_, i) => {
    const t = (2 * Math.PI * i) / cols;
    const v = harmonics.reduce((s, [k, amp, ph]) => s + amp * Math.sin(k * t + ph), 0);
    // min 2: the body overlaps the bottom pixel row (hides tile-edge seams) without covering a crest
    return Math.max(2, Math.min(ROWS - 2, Math.round(base + v)));
  });
}

const FRONT = profile(FRONT_COLS, [[1, 1.4, 0], [2, 0.9, 1.7], [3, 0.6, 0.4], [7, 0.45, 2.2]], 4);
const BACK = profile(BACK_COLS, [[1, 1.2, 2.4], [3, 0.8, 0.9], [5, 0.5, 3.1]], 5);
/** Spray pixels just above some crests (local maxima), skipping a few for irregularity. */
const SPRAY = FRONT.map((h, i) => {
  const l = FRONT[(i - 1 + FRONT_COLS) % FRONT_COLS];
  const r = FRONT[(i + 1) % FRONT_COLS];
  return h > l && h >= r && i % 3 !== 1;
});

/** Small deterministic hash of a region code (for per-region offset, speed and phase). */
function hash(code: string): number {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) h = Math.imul(h ^ code.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Shared wave patterns and clip paths for one map instance (ids prefixed so two maps can coexist). */
export const LiquidDefs = memo(function LiquidDefs({ prefix }: { prefix: string }) {
  return (
    <defs>
      <pattern id={`${prefix}-wave-front`} patternUnits="userSpaceOnUse" width={FRONT_COLS * PX} height={TILE_H} shapeRendering="crispEdges">
        {FRONT.map((n, i) => (
          <g key={i}>
            <rect x={i * PX} y={TILE_H - n * PX} width={PX} height={n * PX} fill={LIQUID.body} />
            <rect x={i * PX} y={TILE_H - n * PX} width={PX} height={PX} fill={LIQUID.crest} />
            {SPRAY[i] && <rect x={i * PX} y={TILE_H - (n + 2) * PX} width={PX} height={PX} fill={LIQUID.spray} />}
          </g>
        ))}
      </pattern>
      <pattern id={`${prefix}-wave-back`} patternUnits="userSpaceOnUse" width={BACK_COLS * PX} height={TILE_H} shapeRendering="crispEdges">
        {BACK.map((n, i) => (
          <rect key={i} x={i * PX} y={TILE_H - n * PX} width={PX} height={n * PX} fill={LIQUID.back} />
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
export const LiquidRegion = memo(function LiquidRegion({ prefix, code, d, support }: { prefix: string; code: string; d: string; support: number }) {
  const box = REGION_BOXES[code];
  const y = levelY(box, support);
  const h = hash(code);
  const frontLen = FRONT_COLS * PX;
  const backLen = BACK_COLS * PX;
  // per-region start offset (whole pixels) and slightly different speed / phase
  const frontX = box.x - frontLen - (h % FRONT_COLS) * PX;
  const backX = box.x - backLen - ((h >>> 8) % BACK_COLS) * PX;
  const frontStyle: CSSProperties = { animationDuration: `${4.2 + ((h >>> 4) % 9) * 0.25}s`, animationDelay: `-${(h >>> 12) % 5}s` };
  const backStyle: CSSProperties = { animationDuration: `${6 + ((h >>> 16) % 7) * 0.4}s`, animationDelay: `-${(h >>> 20) % 6}s` };
  return (
    <g clipPath={`url(#${prefix}-clip-${code})`}>
      <path d={d} fillRule="evenodd" className="glass" />
      <g className="liquid" style={{ transform: `translateY(${y}px)` }} shapeRendering="crispEdges">
        <rect className="wave wave--back" style={backStyle} x={backX} y={-TILE_H} width={box.w + 3 * backLen} height={TILE_H} fill={`url(#${prefix}-wave-back)`} />
        <rect className="wave wave--front" style={frontStyle} x={frontX} y={-TILE_H} width={box.w + 3 * frontLen} height={TILE_H} fill={`url(#${prefix}-wave-front)`} />
        <rect x={box.x - PX} y={-PX} width={box.w + 2 * PX} height={box.h + TILE_H + 8} fill={LIQUID.body} />
      </g>
    </g>
  );
});
