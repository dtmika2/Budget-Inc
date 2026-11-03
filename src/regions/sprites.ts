/**
 * Pixel-art sprites for the living map, as string grids (one char = one pixel, '.' = transparent).
 * Each sprite has one or two frames; frames alternate in CSS. Colours that vary per actor are CSS
 * custom properties (they inherit into <use> shadow trees): --placard, --jacket, --cargo, --cargo-dot.
 * Sprites face right; their origin is bottom-centre.
 */

/** Sprite pixel size in map units (half the liquid wave pixel). */
export const SPX = 3;

const PALETTE: Record<string, string> = {
  K: '#1d1622',
  W: '#f4efe4',
  d: '#5a3b22',
  p: '#e79aa8',
  S: '#e7b48f',
  D: '#2b2540',
  X: '#8a8299',
  R: '#c8352e',
  G: '#9fd3e6',
  L: '#141018',
  H: '#c9c3d6',
  Y: '#ffe14d',
  g: '#a39cb8',
  l: '#b9b4c6',
  c: '#8d879e',
  b: '#5fa8e8',
  F: '#ffd24a',
  r: '#ff6b7a',
  w: '#ffffff',
  P: 'var(--placard, #efe6cf)',
  J: 'var(--jacket, #4a6fa5)',
  C: 'var(--cargo, #efe6cf)',
  E: 'var(--cargo-dot, #8f7740)',
};

const COW_BODY = ['........d.d.', '........WWWW', 'dWWKKWWWWKWW', '.WWKKKWWWWWW', '.WWWWWWKKWpp', '.WWWWWWKKW..'];
const TRUCK_BODY = ['KKKKKKKKKK......', 'KCCCCCCCCK.RRRR.', 'KCEECCEECK.RGGRR', 'KCCCCCCCCK.RGGRR', 'KCCCCCCCCKRRRRRR', 'DDDDDDDDDDDDDDDD'];
const LIMO_BODY = ['.....LLLLLLLLL......', '....LGGGLGGGLGL.....', 'LLLLLLLLLLLLLLLLLLLL', 'HLLLLLLLLLLLLLLLLLLY', 'LLLLLLLLLLLLLLLLLLLL'];
const PROTESTER_BODY = ['..JJJJ.', '..JJJ..', '..JJJ..', '..D.D..', '..D.D..', '..K.K..'];
const CLOUD = ['....llll......', '..lllllllcll..', '.llllllllllll.', 'cccccccccccccc', '.cccccccccccc.'];

export const SPRITES: Record<string, string[][]> = {
  cow: [
    [...COW_BODY, '.K.K...K.K..', '.K.K...K.K..'],
    [...COW_BODY, '..KK...KK...', '.K..K.K..K..'],
  ],
  truck: [
    [...TRUCK_BODY, '..KX.......KX...', '..XK.......XK...'],
    [...TRUCK_BODY, '..XK.......XK...', '..KX.......KX...'],
  ],
  limo: [
    [...LIMO_BODY, '...KX..........KX...'],
    [...LIMO_BODY, '...XK..........XK...'],
  ],
  protester: [
    ['PPPPP..', 'PKPKP..', 'PPPPP..', '..d....', '..dSS..', '..dSS..', ...PROTESTER_BODY],
    ['.......', 'PPPPP..', 'PKPKP..', 'PPPPP..', '..dSS..', '..dSS..', ...PROTESTER_BODY],
  ],
  shout: [['.KKKKKKK.', 'KWWWWWWWK', 'KWWKWKWWK', 'KWWKWKWWK', 'KWWWWWWWK', 'KWWKWKWWK', '.KKKWKKK.', '....K....']],
  pylon: [['g..g..g', 'ggggggg', '...g...', '..ggg..', '..g.g..', '..ggg..', '..g.g..', '.gg.gg.', '.g...g.', '.gg.gg.', 'g.....g', 'gg...gg']],
  bolt: [['...YYY', '..YYY.', '.YYY..', 'YYYYYY', '..YYY.', '.YYY..', 'YYY...', 'YY....', 'Y.....']],
  rain: [
    [...CLOUD, '..............', '.b...b...b..b.', '...b...b...b..', '..............'],
    [...CLOUD, '..............', '..............', '.b...b...b..b.', '...b...b...b..'],
  ],
  // region events (RegionEventLayer.tsx)
  wave: [
    ['.b...b...b..', 'bwb.bwb.bwb.', '..bb..bb..bb'],
    ['..b...b...b.', '.bwb.bwb.bwb', 'bb..bb..bb..'],
  ],
  factory: [['.......XX...', '.......XX...', '.......XX...', 'KKKK...XX...', 'KccK..KXXK..', 'KccKKKKccKKK', 'KccccccccccK', 'KcLcLcLcLccK', 'KccccccccccK', 'KcLcLcLcLccK', 'KKKKKKKKKKKK']],
  smoke: [
    ['..ll..', '.llll.', 'llllll', '.llll.', '..l...'],
    ['...ll.', '.lllll', 'llll..', '.lll..', '...l..'],
  ],
  vip: [
    ['..SS..', '.SSSS.', '..SS..', '.JJJJ.', 'JJWWJJ', 'JJJRJJ', 'JJJRJJ', '.JJJJ.', '.D..D.', '.D..D.', 'KK..KK'],
    ['..SS..', '.SSSS.', '..SS..', '.JJJJ.', 'JJWWJJ', 'SJJRJJ', 'JJJRJS', '.JJJJ.', '.D..D.', '.D..D.', 'KK..KK'],
  ],
  carpet: [['RRRRRRRRRRRRRRRRRRRRRRRR', 'rRRRRRRRRRRRRRRRRRRRRRRr']],
  firework: [
    ['...........', '...........', '...........', '.....F.....', '....rFr....', '...FFwFF...', '....rFr....', '.....F.....', '...........', '...........', '...........'],
    ['F....F....F', '.F...r...F.', '..r.....r..', '...........', '...........', 'Fr...w...rF', '...........', '...........', '..r.....r..', '.F...r...F.', 'F....F....F'],
  ],
};

export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

/** Grid -> rects (horizontal runs merged), origin at bottom-centre, in map units. */
export function spriteRects(grid: readonly string[]): SpriteRect[] {
  const rows = grid.length;
  const cols = Math.max(...grid.map((r) => r.length));
  const out: SpriteRect[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      if (ch !== '.') {
        const fill = PALETTE[ch];
        if (!fill) throw new Error(`sprite: unknown pixel '${ch}'`);
        out.push({ x: (x - cols / 2) * SPX, y: (y - rows) * SPX, w: (end - x) * SPX, h: SPX, fill });
      }
      x = end;
    }
  });
  return out;
}

/** Sprite size in map units. */
export function spriteSize(name: string): { w: number; h: number } {
  const g = SPRITES[name][0];
  return { w: Math.max(...g.map((r) => r.length)) * SPX, h: g.length * SPX };
}
