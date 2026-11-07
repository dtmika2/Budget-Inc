/**
 * Catastrophe impact: pixel cracks spreading from under the card and a burst of dust. Pure decoration.
 * The cracks are drawn like cardArt: whole cells on a grid, rendered crisp, each with a one-cell drop
 * shadow. Cells appear frame by frame outward from where the card landed.
 */
import { memo } from 'react';

const COLS = 120;
const ROWS = 24;

/** Crack branches as grid polylines. A branch starting on an earlier branch grows on from that point. */
const BRANCHES: { pts: [number, number][]; thick?: number }[] = [
  { pts: [[60, 0], [57, 5], [62, 10], [58, 16], [60, 23]], thick: 8 },
  { pts: [[60, 0], [70, 4], [74, 3], [84, 8], [94, 7], [104, 12], [110, 11]], thick: 10 },
  { pts: [[60, 0], [49, 4], [45, 3], [35, 8], [25, 7], [15, 12], [9, 11]], thick: 10 },
  { pts: [[70, 4], [72, 11], [79, 15]] },
  { pts: [[49, 4], [47, 11], [40, 15]] },
  { pts: [[94, 7], [97, 13]] },
  { pts: [[25, 7], [22, 13]] },
  { pts: [[62, 10], [67, 13]] },
];

/** Cells grown per animation frame, and the frame length in seconds. */
const CELLS_PER_FRAME = 3;
const FRAME_S = 0.03;
const START_S = 0.52;

/** Bresenham line between two grid points (8-connected staircase, no anti-aliasing). */
function line([x0, y0]: [number, number], [x1, y1]: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Cells grouped by the frame they appear in: crack cells and their shadow cells. */
function buildFrames(): { crack: [number, number][]; shadow: [number, number][] }[] {
  const order = new Map<string, number>();
  const put = (x: number, y: number, o: number) => {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    const k = `${x},${y}`;
    if (!order.has(k) || order.get(k)! > o) order.set(k, o);
  };
  for (const { pts, thick = 0 } of BRANCHES) {
    let o = order.get(`${pts[0][0]},${pts[0][1]}`) ?? 0;
    for (let i = 1; i < pts.length; i++) {
      const cells = line(pts[i - 1], pts[i]);
      for (let j = i === 1 ? 0 : 1; j < cells.length; j++) {
        const [x, y] = cells[j];
        put(x, y, o);
        // the crack is two cells wide near the impact, one cell further out
        if (o < thick) put(x + 1, y, o);
        o++;
      }
    }
  }
  const frames: { crack: [number, number][]; shadow: [number, number][] }[] = [];
  for (const [k, o] of order) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    const f = Math.floor(o / CELLS_PER_FRAME);
    frames[f] ??= { crack: [], shadow: [] };
    frames[f].crack.push([x, y]);
    if (!order.has(`${x + 1},${y + 1}`)) frames[f].shadow.push([x + 1, y + 1]);
  }
  return frames;
}

const FRAMES = buildFrames();

/** Dust squares: horizontal drift and rise in px. */
const DUST: [number, number][] = [
  [-150, -40],
  [-110, -70],
  [-70, -30],
  [-30, -60],
  [10, -45],
  [50, -75],
  [90, -35],
  [130, -65],
  [160, -30],
  [-180, -20],
];

const Cracks = memo(function Cracks() {
  return (
    <svg className="quake-fx__cracks" viewBox={`0 0 ${COLS} ${ROWS + 1}`} preserveAspectRatio="xMidYMin meet" shapeRendering="crispEdges">
      {FRAMES.map((fr, i) =>
        fr ? (
          <g key={i} className="quake-fx__frame" style={{ animationDelay: `${(START_S + i * FRAME_S).toFixed(2)}s` }}>
            {fr.shadow.map(([x, y]) => (
              <rect key={`s${x}-${y}`} x={x} y={y} width={1} height={1} className="quake-fx__shadow" />
            ))}
            {fr.crack.map(([x, y]) => (
              <rect key={`c${x}-${y}`} x={x} y={y} width={1} height={1} className="quake-fx__crack" />
            ))}
          </g>
        ) : null,
      )}
    </svg>
  );
});

export function CatastropheFx() {
  return (
    <div className="quake-fx" aria-hidden="true">
      <Cracks />
      {DUST.map(([dx, dy], i) => (
        <span
          key={i}
          className="quake-fx__dust"
          style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animationDelay: `${0.5 + (i % 3) * 0.04}s` }}
        />
      ))}
    </div>
  );
}
