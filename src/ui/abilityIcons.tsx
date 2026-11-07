/**
 * Pixel-art icons of the leader abilities (phase 17): 16 x 16 letter grids, one letter per pixel, drawn as
 * merged SVG rects on a mid-tone tile (so both the dark outlines and the light parts read on the dark UI).
 * P / L are the leader's colour and its light shade (CSS --party / --party-light set by the parent), so
 * every icon comes in its leader's colour; the tile's border is the leader's colour too.
 */
import { memo } from 'react';

const PALETTE: Record<string, string> = {
  K: '#1d1622',
  W: '#f4efe4',
  S: '#e7b48f',
  R: '#c8352e',
  G: '#d9b45a',
  X: '#8a8299',
  T: '#a4793f',
  Y: '#e2c47c',
  E: '#4f9a4a',
  B: '#6fb7e8',
  P: 'var(--party, #2f6fe4)',
  L: 'var(--party-light, #9fc0ff)',
};

export const ABILITY_ICONS: Record<string, string[]> = {
  // a newspaper and a microphone with a grille head on its stand
  press_release: [
    '................',
    '.WWWWWWWW..KKK..',
    '.WKKKKKKW.KLLLK.',
    '.WWWWWWWW.KXLXK.',
    '.WKK.KKKW.KLXLK.',
    '.WWWWWWWW.KXLXK.',
    '.WKKKK.KW.KLLLK.',
    '.WWWWWWWW..KKK..',
    '.WKK.KKKW...K...',
    '.WWWWWWWW...K...',
    '.WKKKKK.W.PPKPP.',
    '.WWWWWWWW...K...',
    '............K...',
    '..........KKKKK.',
    '................',
    '................',
  ],
  // a fedora with a band, a cigar with a glowing tip and a wisp of smoke
  godfathers: [
    '................',
    '................',
    '.....PPPPPP.....',
    '....PPPPPPPP....',
    '....PPPPPPPP....',
    '....KKKKKKKK....',
    '..PPPPPPPPPPPP..',
    '.PPPPPPPPPPPPPP.',
    '....SSSSSSSS....',
    '....SKSSSSKS....',
    '....SSSSSSSS....',
    '....SSKKKSWWWWWR',
    '.....SSSSSS....X',
    '...LLLLLLLLLL..X',
    '..LLLLWKWLLLL...',
    '..LLLLWKWLLLL...',
  ],
  // a judge's gavel in the party colours over its block, and an exclamation mark
  condemnation: [
    '................',
    '..KKKKKKKKKK..R.',
    '.KTTPTTTTPTTK.R.',
    '.KYYPYYYYPYYK.R.',
    '.KTTPTTTTPTTK...',
    '..KKKKKKKKKK..R.',
    '......KYK.......',
    '......KYK.......',
    '......KYK.......',
    '......KYK.......',
    '......KYK.......',
    '...KKKKKKKKK....',
    '..KXXXXXXXXXK...',
    '.KXXXXXXXXXXXK..',
    '.KKKKKKKKKKKKK..',
    '................',
  ],
  // a money bag tied with a ribbon, a stack of coins below
  subsidies: [
    '................',
    '......KKKK......',
    '.......KK.......',
    '......KPPK......',
    '.....KLLLLK.....',
    '....KLLGGLLK....',
    '...KLLGLLLLLK...',
    '...KLLLGGLLLK...',
    '...KLLLLLGLLK...',
    '...KLLGGGLLLK...',
    '...KLLLLLLLLK...',
    '....KKKKKKKK....',
    '................',
    '.GGG..GGG..GGG..',
    '.KKK..KKK..KKK..',
    '................',
  ],
  // a hand pulling the strings of a little puppet
  microbossing: [
    '...PPPPPPPPPP...',
    '..KSSSSSSSSSSK..',
    '..KSKSKSKSKSSK..',
    '...K.K.K.K.KK...',
    '...W...W...W....',
    '...W...W...W....',
    '...W...W...W....',
    '...W..KKK..W....',
    '...W.KSSSK.W....',
    '...WKKPPPKKW....',
    '.....KPPPK......',
    '.....KPPPK......',
    '......K.K.......',
    '......W.W.......',
    '.....KK.KK......',
    '................',
  ],
  // an eye watching over a file folder
  stb: [
    '................',
    '....KKKKKKKK....',
    '..KKWWWWWWWWKK..',
    '.KWWWWKKKKWWWWK.',
    'KWWWWKPPPPKWWWWK',
    '.KWWWWKKKKWWWWK.',
    '..KKWWWWWWWWKK..',
    '....KKKKKKKK....',
    '................',
    '.TTTTT..........',
    '.TYYYYTTTTTTTTT.',
    '.TYYYYYYYYYYYYT.',
    '.TYYKKKKKYYYYYT.',
    '.TYYYYYYYYYYYYT.',
    '.TTTTTTTTTTTTTT.',
    '................',
  ],
  // a passenger plane seen from above, wings in the party colour
  taiwan_trip: [
    '................',
    '.......KK.......',
    '......KWWK......',
    '......KWWK......',
    '......KWWK......',
    '...KKKKWWKKKK...',
    '.KKWWWWWWWWWWKK.',
    'KPPPPPWWWWPPPPPK',
    '.KKKKKWWWWKKKKK.',
    '......KWWK......',
    '......KWWK......',
    '.....KKWWKK.....',
    '....KPPWWPPK....',
    '....KKKKKKKK....',
    '................',
    '................',
  ],
  // a laptop and a rubber stamp beside it
  digital_permit: [
    '................',
    '..KKKKKKKKKK....',
    '..KBBBBBBBBK....',
    '..KBWWWWWWBK....',
    '..KBWKKKWWBK....',
    '..KBWWWWWWBK....',
    '..KBBBBBBBBK....',
    '.KKKKKKKKKKKK...',
    'KXXXXXXXXXXXXK..',
    'KKKKKKKKKKKKKK..',
    '..........KPK...',
    '..........KPK...',
    '.........KPPPK..',
    '........KRRRRRK.',
    '........KKKKKKK.',
    '................',
  ],
  // a tram with its pantograph, on rails
  tram_everywhere: [
    '.......K........',
    '......K.K.......',
    '.....K...K......',
    '...KKKKKKKKKK...',
    '..KPPPPPPPPPPK..',
    '..KPBBPBBPBBPK..',
    '..KPBBPBBPBBPK..',
    '..KPPPPPPPPPPK..',
    '..KLLLLLLLLLLK..',
    '..KPPPPPPPPPPK..',
    '..KPPPPPPPPPPK..',
    '..KKKKKKKKKKKK..',
    '...KXK....KXK...',
    'XXXXXXXXXXXXXXXX',
    '.T..T..T..T..T..',
    '................',
  ],
  // a fuel pump with its hose and nozzle
  cheap_fuel: [
    '................',
    '..KKKKKKK.......',
    '..KPPPPPK.......',
    '..KPWWWPK.......',
    '..KPWKWPK.......',
    '..KPWWWPK.......',
    '..KPPPPPKKKK....',
    '..KPPPPPK..K....',
    '..KPPPPPK..K....',
    '..KPPPPPK..K....',
    '..KPPPPPK.KXK...',
    '..KPPPPPK.KXK...',
    '.KKKKKKKKK.K....',
    '.KXXXXXXXK......',
    '.KKKKKKKKK......',
    '................',
  ],
  // a thermometer in the red and a ticked box
  climate_commissioner: [
    '................',
    '...KKK..........',
    '..KWWWK.........',
    '..KWRWK.........',
    '..KWRWK...KKKKKK',
    '..KWRWK...KWWWWK',
    '..KWRWK...KWWWEK',
    '..KWRWK...KWWEWK',
    '..KWRWK...KEWEWK',
    '..KWRWK...KWEWWK',
    '.KRRRRRK..KKKKKK',
    'KRRRRRRRK.......',
    'KRRRRRRRK.......',
    '.KRRRRRK........',
    '..KKKKK.........',
    '................',
  ],
  // a castle with a flag in the party colour and its gate barred shut
  castle_rejection: [
    '.......KPP......',
    'KK.KK..K...KK.KK',
    'KXKXK..K...KXKXK',
    'KXXXK..K...KXXXK',
    'KXXXKKKK.KKKXXXK',
    'KXKXKXXXXXXKXKXK',
    'KXXXKXXXXXXKXXXK',
    'KXXXKXXKKXXKXXXK',
    'KXXXKXKTTKXKXXXK',
    'KXXXKXKTTKXKXXXK',
    'KXXXKXKRRKXKXXXK',
    'KXXXKXKTTKXKXXXK',
    'KXXXKXKTTKXKXXXK',
    'KKKKKKKKKKKKKKKK',
    '................',
    '................',
  ],
};

/** Grid -> rects with horizontal runs merged. Throws on an unknown pixel letter (checked by tests). */
export function iconRects(grid: readonly string[]): { x: number; y: number; w: number; fill: string }[] {
  const out: { x: number; y: number; w: number; fill: string }[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      if (ch !== '.') {
        const fill = PALETTE[ch];
        if (!fill) throw new Error(`ability icon: unknown pixel '${ch}'`);
        out.push({ x, y, w: end - x, fill });
      }
      x = end;
    }
  });
  return out;
}

export const AbilityIcon = memo(function AbilityIcon({ icon, size = 48 }: { icon: string; size?: number }) {
  const grid = ABILITY_ICONS[icon];
  if (!grid) return null;
  return (
    <svg className="ability-icon" viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true">
      {iconRects(grid).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
});
