/**
 * Liquid fill for map regions: each kraj is a mustard-beige glass clipped to its own shape, filled up to
 * its support level (0–100 % of the region's height): red wine in Moravia, foamy beer everywhere else. The
 * surface is a two-layer pixel wave with an irregular profile (several harmonics + occasional spray pixels
 * or foam bubbles) that scrolls in whole-pixel steps; each region gets its own offset, speed and phase so
 * neighbours never move in lockstep. The level steps up/down when support changes. Reduced motion stops
 * all of it (global CSS).
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

const BEER = {
  body: '#bd6f10',
  crest: '#e39c2a', // bright line where the beer meets the foam
  back: '#ead9ab', // back wave: the far side of the foam head
  foam: '#f7ecd2',
  foamTop: '#fffaf0',
  foamShade: '#e2cd9b',
};

/** Kraje that keep red wine: the four Moravian ones (names in locales/regions.cs.json). All others pour beer. */
const WINE_REGIONS = new Set(['CZ064', 'CZ071', 'CZ072', 'CZ080']);

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
/** Columns for loose pixels just above some crests (local maxima), skipping a few for irregularity. */
function crests(heights: number[]): boolean[] {
  const cols = heights.length;
  return heights.map((h, i) => h > heights[(i - 1 + cols) % cols] && h >= heights[(i + 1) % cols] && i % 3 !== 1);
}

const SPRAY = crests(FRONT);

// Beer sits calmer than wine: a flatter surface under a lumpy foam head, same periods so the CSS keyframes fit.
const BEER_FRONT = profile(FRONT_COLS, [[1, 0.7, 0.6], [2, 0.45, 2.3], [5, 0.3, 1.1]], 3);
const FOAM = profile(FRONT_COLS, [[3, 0.7, 0.9], [8, 0.6, 2.4], [13, 0.3, 0.5]], 2.6);
const BEER_BACK = profile(BACK_COLS, [[2, 0.7, 1.2], [5, 0.6, 0.3], [9, 0.4, 2]], 6);
const FOAM_TOP = BEER_FRONT.map((n, i) => n + FOAM[i]);
const BUBBLES = crests(FOAM_TOP);

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
      <pattern id={`${prefix}-beer-front`} patternUnits="userSpaceOnUse" width={FRONT_COLS * PX} height={TILE_H} shapeRendering="crispEdges">
        {BEER_FRONT.map((n, i) => {
          const top = FOAM_TOP[i];
          return (
            <g key={i}>
              <rect x={i * PX} y={TILE_H - n * PX} width={PX} height={n * PX} fill={BEER.body} />
              <rect x={i * PX} y={TILE_H - n * PX} width={PX} height={PX} fill={BEER.crest} />
              <rect x={i * PX} y={TILE_H - top * PX} width={PX} height={FOAM[i] * PX} fill={BEER.foam} />
              <rect x={i * PX} y={TILE_H - (n + 1) * PX} width={PX} height={PX} fill={BEER.foamShade} />
              <rect x={i * PX} y={TILE_H - top * PX} width={PX} height={PX} fill={BEER.foamTop} />
              {BUBBLES[i] && top + 2 <= ROWS && <rect x={i * PX} y={TILE_H - (top + 2) * PX} width={PX} height={PX} fill={BEER.foam} />}
            </g>
          );
        })}
      </pattern>
      <pattern id={`${prefix}-beer-back`} patternUnits="userSpaceOnUse" width={BACK_COLS * PX} height={TILE_H} shapeRendering="crispEdges">
        {BEER_BACK.map((n, i) => (
          <rect key={i} x={i * PX} y={TILE_H - n * PX} width={PX} height={n * PX} fill={BEER.back} />
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
  const wine = WINE_REGIONS.has(code);
  const pattern = wine ? 'wave' : 'beer';
  return (
    <g clipPath={`url(#${prefix}-clip-${code})`}>
      <path d={d} fillRule="evenodd" className="glass" />
      <g className="liquid" style={{ transform: `translateY(${y}px)` }} shapeRendering="crispEdges">
        <rect className="wave wave--back" style={backStyle} x={backX} y={-TILE_H} width={box.w + 3 * backLen} height={TILE_H} fill={`url(#${prefix}-${pattern}-back)`} />
        <rect className="wave wave--front" style={frontStyle} x={frontX} y={-TILE_H} width={box.w + 3 * frontLen} height={TILE_H} fill={`url(#${prefix}-${pattern}-front)`} />
        <rect x={box.x - PX} y={-PX} width={box.w + 2 * PX} height={box.h + TILE_H + 8} fill={wine ? LIQUID.body : BEER.body} />
      </g>
    </g>
  );
});
