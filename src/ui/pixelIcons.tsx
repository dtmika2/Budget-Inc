/**
 * Small pixel icons that replace the emojis in the UI: 10 x 10 letter grids like the top-bar resources, one
 * letter per pixel, drawn by the ability icons' renderer (see PALETTE in ./abilityIcons for the letters).
 * Best at multiples of 10 px. C is the text colour, so an icon can follow its surroundings.
 */
import { memo } from 'react';
import { iconRects } from './abilityIcons';

export const PIXEL_ICONS = {
  // pledges on the map
  hourglass: ['.TTTTTTTT.', '..KWWWWK..', '..KGGGGK..', '...KGGK...', '....KK....', '....KK....', '...KWGK...', '..KWGGGK..', '..KGGGGK..', '.TTTTTTTT.'],
  // regional-tour mini-game
  handshake: ['..........', '..........', 'PP......LL', 'PPSSS.SSLL', 'PPSSSSSKLL', 'PPSKSSKSLL', 'PP.SKSKSLL', 'PP..SSS.LL', '..........', '..........'],
  egg: ['..........', '....KK....', '...KWWK...', '..KWWWWK..', '..KWWWWK..', '.KWWWWWWK.', '.KWWWWWXK.', '.KWWWWXXK.', '..KWWXXK..', '...KKKK...'],
  tomato: ['....EE....', '..EEEEEE..', '..RREERR..', '.RRRRRRRR.', 'RRWRRRRRRR', 'RRWRRRRRRR', 'RRRRRRRRRR', '.RRRRRRRR.', '..RRRRRR..', '..........'],
  // channels of a regional compromise
  newspaper: ['KKKKKKKKKK', 'KWWWWWWWWK', 'KWKKKKKKWK', 'KWWWWWWWWK', 'KWKKWXXXWK', 'KWKKWWWWWK', 'KWWWWXXXWK', 'KWXXXWWWWK', 'KWWWWWWWWK', 'KKKKKKKKKK'],
  tv: ['..X....X..', '...X..X...', '....XX....', 'KKKKKKKKKK', 'KBBBBBBKXK', 'KBBBBBBKRK', 'KBBBBBBKXK', 'KBBBBBBKXK', 'KKKKKKKKKK', '.KK....KK.'],
  bus: ['..........', '.GGGGGGGG.', 'GGGGGGGGGG', 'GBBGBBGBBG', 'GBBGBBGBBG', 'GGGGGGGGGG', 'TTTTTTTTTT', 'GGGGGGGGGG', '.KKK..KKK.', '..X....X..'],
  // leanings of the policy cards
  scales: ['....TT....', '.TTTTTTTT.', '.T..TT..T.', '.T..TT..T.', 'TTT.TT.TTT', 'TTT.TT.TTT', '....TT....', '....TT....', '..TTTTTT..', '..........'],
  house: ['....KK....', '...KRRK...', '..KRRRRK..', '.KRRRRRRK.', 'KKKKKKKKKK', '.KYYYYYYK.', '.KYKKYBBK.', '.KYKKYBBK.', '.KYKKYYYK.', '.KKKKKKKK.'],
  smiley: ['..KKKKKK..', '.KGGGGGGK.', 'KGGGGGGGGK', 'KGGKGGKGGK', 'KGGKGGKGGK', 'KGGGGGGGGK', 'KGKGGGGKGK', 'KGGKKKKGGK', '.KGGGGGGK.', '..KKKKKK..'],
  tools: ['.XXX...XX.', 'XXXXX..XXX', '.XXXT.T.XX', '..X.TT...X', '....TT....', '...T..T...', '..T....T..', '.T......T.', 'T........T', '..........'],
  flower: ['..RR..RR..', '.RRRRRRRR.', '..RRGGRR..', '.RRGGGGRR.', '..RRGGRR..', '.RRRRRRRR.', '..RR..RR..', '....EE....', '..EEEE....', '....EE....'],
  skull: ['..KKKKKK..', '.KWWWWWWK.', 'KWWWWWWWWK', 'KWKKWWKKWK', 'KWKKWWKKWK', 'KWWWKKWWWK', '.KWWWWWWK.', '..KWKKWK..', '..KWKKWK..', '...KKKK...'],
  redStar: ['....RR....', '....RR....', '...RRRR...', 'RRRRRRRRRR', '.RRRRRRRR.', '..RRRRRR..', '..RRRRRR..', '.RRR..RRR.', '.RR....RR.', '..........'],
  // a regional compromise, in place of a leaning
  swap: ['......C...', '.......C..', 'CCCCCCCCC.', '.......C..', '......C...', '...C......', '..C.......', '.CCCCCCCCC', '..C.......', '...C......'],
  // lanes of the effect display
  people: ['....SS....', '....SS....', '.SS.PP.SS.', '.SSPPPPSS.', 'LLLPPPPLLL', 'LLLPPPPLLL', 'LLLPPPPLLL', 'LL.PPPP.LL', '..........', '..........'],
  pin: ['...RRRR...', '..RRRRRR..', '.RRRWWRRR.', '.RRWWWWRR.', '.RRRWWRRR.', '..RRRRRR..', '..RRRRRR..', '...RRRR...', '....RR....', '....RR....'],
  // an effect that keeps running
  repeat: ['..CCCCC.C.', '.C.....CC.', 'C.....CCC.', 'C.........', 'C........C', 'C........C', '.........C', '.CCC.....C', '.CC.....C.', '.C.CCCCC..'],
  // special cards
  alert: ['....KK....', '...KGGK...', '...KGGK...', '..KGKKGK..', '..KGKKGK..', '.KGGKKGGK.', '.KGGKKGGK.', 'KGGGGGGGGK', 'KGGGKKGGGK', 'KKKKKKKKKK'],
  star: ['....KK....', '...KWWK...', 'KKKKWWKKKK', 'KWWWWWWWWK', '.KWWWWWWK.', '..KWWWWK..', '.KWWKKWWK.', '.KWK..KWK.', '.KK....KK.', '..........'],
} as const satisfies Record<string, readonly string[]>;

export type PixelIconName = keyof typeof PIXEL_ICONS;

export const PixelIcon = memo(function PixelIcon({ name, size = 20 }: { name: PixelIconName; size?: number }) {
  const grid = PIXEL_ICONS[name];
  if (!grid) return null;
  return (
    <svg className="pixel-icon" viewBox="0 0 10 10" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true">
      {iconRects(grid).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
});
