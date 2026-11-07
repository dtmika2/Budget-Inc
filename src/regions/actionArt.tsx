/**
 * Pixel art for the Akce tab's compass (regions workspace): a scene per kraj action, the compass rose, its centre
 * disc and the needle. Drawn like the special-card art: a letter grid, one letter per pixel, rendered crisp with
 * runs of a colour merged into one rect. Generic placeholder art, no likenesses.
 */
import { memo, useMemo } from 'react';

const PAL: Record<string, string> = {
  k: '#1c1a24', // outline
  w: '#efe6cf', // paper
  r: '#c8352e', // red
  R: '#8f201b', // dark red
  y: '#d9b45a', // gold
  Y: '#a8842f', // dark gold
  c: '#8d8a96', // grey
  C: '#5d5a68', // dark grey
  b: '#5f9bd1', // window blue
  g: '#6fc27f', // grass
  o: '#e0952c', // orange
  a: '#3a3646', // asphalt
};

/** Kraj action scenes (24 x 14), keyed by action id in data/region_actions. */
const SCENES: Record<string, string[]> = {
  /** A schoolhouse with a bell tower and a flag. */
  school: [
    '...........krrr.........',
    '...........krr..........',
    '...........k............',
    '..........kRk...........',
    '.........kRRRk..........',
    '.........kwywk..........',
    '....kRRRRkwwwkRRRRRk....',
    '...kRRRRRRRRRRRRRRRRk...',
    '..kRRRRRRRRRRRRRRRRRRk..',
    '...kwwwwwwwwwwwwwwwwk...',
    '...kwbbwbbwkkwbbwbbwk...',
    '...kwbbwbbwkYkwbbwbbk...',
    '...kwwwwwwwkYkwwwwwwk...',
    'gggkkkkkkkkkkkkkkkkkkggg',
  ],
  /** A hospital with a red cross and an ambulance. */
  hospital: [
    '........................',
    '....kkkkkkkkkkkkkk......',
    '....kwwwwwwwwwwwwk......',
    '....kwwwwwrrwwwwwk......',
    '....kwwwwrrrrwwwwk......',
    '....kwwwwwrrwwwwwk......',
    '....kwwwwwwwwwwwwk......',
    '....kwbbwbbwbbwbbk......',
    '....kwbbwbbwbbwbbk.kkkkk',
    '....kwwwwwwwwwwwwkkwwrwk',
    '....kwbbwkkkkwbbwkwrrrwk',
    '....kwwwwkbbkwwwwkwwrwwk',
    '....kwwwwkbbkwwwwkkkkkkk',
    'kkkkkkkkkkkkkkkkkkkCkkCk',
  ],
  /** A road with a dashed line, a roller and a traffic cone. */
  road: [
    '........................',
    '..................kk....',
    '.................kook...',
    '.................kwwk...',
    '....yyyy........kooook..',
    '...kYYYYk.......kwwwwk..',
    '...kyyyyk......kkkkkkkk.',
    '..kkkkkkkk..............',
    '..kCkkkkCk..............',
    'aaaaaaaaaaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaaaaaaaaaa',
    'awwwwaaawwwwaaawwwwaaaww',
    'aaaaaaaaaaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaaaaaaaaaa',
  ],
  /** A sawtooth-roof factory with a smoking chimney. */
  factory: [
    '...................cc...',
    '.................ccccc..',
    '................cc.cc...',
    '..................kk....',
    '..................kk....',
    '..................kk....',
    '..k...k...k.......kk....',
    '..kk..kk..kk......kk....',
    '..kCk.kCk.kCk.....kk....',
    '..kCCkkCCkkCCkkkkkkkk...',
    '..kCCCCCCCCCCCCCCCCCk...',
    '..kCyyCCyyCCyyCCkkCCk...',
    '..kCCCCCCCCCCCCCkYkCk...',
    'kkkkkkkkkkkkkkkkkkkkkkkk',
  ],
  /** A campaign bus with a little flag. */
  visit: [
    '......k.................',
    '......krrr..............',
    '......krr...............',
    '......k.................',
    '......k.................',
    '...kkkkkkkkkk...........',
    '..kbbkbbkbbbkk..........',
    '.kkkkkkkkkkkkkkkkkkkk...',
    '.kwwwwwwwwwwwwwwwwwwwk..',
    '.kwyywwwwwwwwwwwwwwyyk..',
    '.kkkkkkkkkkkkkkkkkkkkk..',
    '...kCCk.........kCCk....',
    '....kk...........kk.....',
    'cccccccccccccccccccccccc',
  ],
};

/** Fallback for an action without its own scene: a signpost. */
const FALLBACK = [
  '........................',
  '...........kk...........',
  '......kkkkkkkkkkkk......',
  '......kyyyyyyyyyyyk.....',
  '......kyyyyyyyyyyyyk....',
  '......kyyyyyyyyyyyk.....',
  '......kkkkkkkkkkkk......',
  '...........kk...........',
  '...........kk...........',
  '...........kk...........',
  '...........kk...........',
  '...........kk...........',
  '..........kkkk..........',
  'gggggggggggggggggggggggg',
];

function Grid({ rows, w, h, className }: { rows: readonly string[]; w: number; h: number; className?: string }) {
  const rects: JSX.Element[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const fill = PAL[ch];
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x} height={1} fill={fill} />);
      x = end;
    }
  });
  return (
    <svg className={className} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden="true">
      {rects}
    </svg>
  );
}

export const ActionArt = memo(function ActionArt({ id }: { id: string }) {
  return <Grid rows={SCENES[id] ?? FALLBACK} w={24} h={14} />;
});

export type Dir = 'n' | 'e' | 's' | 'w';

/** Rose cell kinds: outline, a long (cardinal) point or a short (diagonal) point, split into light and dark halves. */
type RoseCell = { kind: 'k' | 'long' | 'short'; arm: Dir | null; light: boolean };

const ROSE_N = 37;
/** Long point, short point and inner radius in cells. */
const ROSE_R = [18, 12, 7.5] as const;

/** Rasterizes an 8-point star: a cell is in when its centre is inside the star polygon (no anti-aliasing). */
function rasterRose(): (RoseCell | null)[][] {
  const c = ROSE_N / 2;
  const pts: [number, number][] = [];
  for (let k = 0; k < 16; k++) {
    const a = ((90 - k * 22.5) * Math.PI) / 180;
    const rad = k % 2 ? ROSE_R[2] : k % 4 ? ROSE_R[1] : ROSE_R[0];
    pts.push([c + rad * Math.cos(a), c - rad * Math.sin(a)]);
  }
  const inside = (x: number, y: number) => {
    let res = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) res = !res;
    }
    return res;
  };
  const inGrid = Array.from({ length: ROSE_N }, (_, y) => Array.from({ length: ROSE_N }, (_, x) => inside(x + 0.5, y + 0.5)));
  const ARM: Record<number, Dir> = { 90: 'n', 0: 'e', 270: 's', 180: 'w' };
  return inGrid.map((row, y) =>
    row.map((on, x) => {
      if (!on) return null;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inGrid[y + dy]?.[x + dx]);
      const th = ((Math.atan2(c - (y + 0.5), x + 0.5 - c) * 180) / Math.PI + 360) % 360;
      const ax = (Math.round(th / 45) * 45) % 360;
      const long = ax % 90 === 0;
      return { kind: edge ? 'k' : long ? 'long' : 'short', arm: long ? ARM[ax] : null, light: ((th - ax + 540) % 360) - 180 > 0 };
    }),
  );
}

const ROSE = rasterRose();

/** The compass rose; the `lit` arm (hovered or done) is drawn bright. */
export const RoseArt = memo(function RoseArt({ lit, className }: { lit: Dir | null; className?: string }) {
  const rows = useMemo(
    () =>
      ROSE.map((row) =>
        row
          .map((cell) => {
            if (!cell) return '.';
            if (cell.kind === 'k') return 'k';
            if (cell.kind === 'short') return cell.light ? 'c' : 'C';
            if (cell.arm === lit) return cell.light ? 'w' : 'o';
            return cell.light ? 'y' : 'Y';
          })
          .join(''),
      ),
    [lit],
  );
  return <Grid rows={rows} w={ROSE_N} h={ROSE_N} className={className} />;
});

const DISC_N = 21;

/** The centre disc: a pixel circle with an outline and a gold rim. */
const DISC = Array.from({ length: DISC_N }, (_, y) =>
  Array.from({ length: DISC_N }, (_, x) => {
    const d = Math.hypot(x + 0.5 - DISC_N / 2, y + 0.5 - DISC_N / 2);
    return d > DISC_N / 2 ? '.' : d > DISC_N / 2 - 1.1 ? 'k' : d > DISC_N / 2 - 2.4 ? 'y' : d > DISC_N / 2 - 3.2 ? 'Y' : 'w';
  }).join(''),
);

export const DiscArt = memo(function DiscArt({ className }: { className?: string }) {
  return <Grid rows={DISC} w={DISC_N} h={DISC_N} className={className} />;
});

/** The needle: a red pixel arrow pointing up (the wrapper rotates it toward a direction). */
const NEEDLE = ['..k..', '.krk.', 'krrrk', 'kkkkk'];

export const NeedleArt = memo(function NeedleArt({ className }: { className?: string }) {
  return <Grid rows={NEEDLE} w={5} h={4} className={className} />;
});
