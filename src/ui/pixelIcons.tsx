/**
 * Small pixel icons that replace the emojis in the UI: 10 x 10 letter grids like the top-bar resources, one
 * letter per pixel, drawn by the ability icons' renderer (see PALETTE in ./abilityIcons for the letters).
 * Best at multiples of 10 px.
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
  // buttons above the upgrades button
  soundOn: ['....W.....', '...WW..G..', '..WWW...G.', 'WWWWW.G..G', 'WWWWW..G.G', 'WWWWW..G.G', 'WWWWW.G..G', '..WWW...G.', '...WW..G..', '....W.....'],
  soundOff: ['....W.....', '...WW.....', '..WWW.....', 'WWWWWR...R', 'WWWWW.R.R.', 'WWWWW..R..', 'WWWWW.R.R.', '..WWWR...R', '...WW.....', '....W.....'],
  coffee: ['...W..W...', '..W..W....', '...W..W...', 'TTTTTTTT..', 'WWWWWWWWW.', 'WWWWWWWW.W', 'WWWWWWWW.W', 'WWWWWWWWW.', '.WWWWWW...', 'TTTTTTTTT.'],
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
