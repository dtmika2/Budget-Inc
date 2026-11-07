/**
 * Pixel emblems for the skill-tree card's art panel: one per compass quadrant and one shared by the boxes on
 * an axis. 24 x 14 letter grids like the special cards' scenes (letters: PALETTE in @ui/abilityIcons). Generic
 * placeholder art: no party symbols, flags or likenesses.
 */
import { memo } from 'react';
import { iconRects } from '@ui/abilityIcons';
import type { Quadrant } from './nodeText';

const SEEDLING = [
  '........................',
  '.......EEE..............',
  '......EEEEE...EEE.......',
  '......EEEEEE.EEEEE......',
  '.......EEEEEEEEEE.......',
  '.........EEEEEE.........',
  '...........EE...........',
  '...........EE...........',
  '...........EE...........',
  '...........EE...........',
  '......TTTTTTTTTTTT......',
  '....TTTTTTTTTTTTTTTT....',
  '..TTTTTTTTTTTTTTTTTTTT..',
  'TTTTTTTTTTTTTTTTTTTTTTTT',
];

const BULB_AND_GEAR = [
  '.......YYYY.............',
  '.....YYYYYYYY...........',
  '....YYWWYYYYYY....XX....',
  '....YWWYYYYYYY..X.XX.X..',
  '....YWYYYYYYYY...XXXX...',
  '....YYYYYYYYYY.XXXXXXXX.',
  '.....YYYYYYYY..XXX..XXX.',
  '......YYYYYY...XX....XX.',
  '.......YYYY....XXX..XXX.',
  '.......XXXX....XXXXXXXX.',
  '.......KKKK......XXXX...',
  '.......XXXX.....X.XX.X..',
  '.......KKKK.......XX....',
  '........KK..............',
];

const FACTORY = [
  '...XX...................',
  '.....XXX................',
  '....XX...XX.............',
  '..RR.....RR.............',
  '..RR.....RR.............',
  '..RR.....RR.............',
  '..RR.....RR...R....R....',
  '..RR.....RR..RR...RR....',
  '..RRRRRRRRRRRRRRRRRRRRR.',
  '..RRRRRRRRRRRRRRRRRRRRR.',
  '..RRYYRRYYRRYYRRYYRRYYR.',
  '..RRYYRRYYRRYYRRYYRRYYR.',
  '..RRRRRRRRRRRRRRRRRRRRR.',
  'KKKKKKKKKKKKKKKKKKKKKKKK',
];

const TOWER = [
  '.....GG..GG..GG..GG.....',
  '.....GG..GG..GG..GG.....',
  '.....GGGGGGGGGGGGGG.....',
  '.....GGGGGGGGGGGGGG.....',
  '......GGGGGGGGGGGG......',
  '.......GGGGKKGGGG.......',
  '.......GGGGKKGGGG.......',
  '.......GGGGGGGGGG.......',
  '.......GGGGGGGGGG.......',
  '.......GGGGKKGGGG.......',
  '.......GGGKKKKGGG.......',
  '.......GGGKKKKGGG.......',
  '.......GGGKKKKGGG.......',
  'TTTTTTTTTTTTTTTTTTTTTTTT',
];

const COMPASS = [
  '...........WW...........',
  '...........WW...........',
  '..........WWWW..........',
  '........X.WWWW.X........',
  '.........XXWWXX.........',
  '....XXXXXXXRRXXXXXXX....',
  '.WWWWWWWWWWRRWWWWWWWWWW.',
  '.WWWWWWWWWWRRWWWWWWWWWW.',
  '....XXXXXXXRRXXXXXXX....',
  '.........XXWWXX.........',
  '........X.WWWW.X........',
  '..........WWWW..........',
  '...........WW...........',
  '...........WW...........',
];

export const QUADRANT_ART: Record<Quadrant, readonly string[]> = {
  lp: SEEDLING,
  rp: BULB_AND_GEAR,
  lt: FACTORY,
  rt: TOWER,
  p: COMPASS,
  t: COMPASS,
  l: COMPASS,
  r: COMPASS,
};

export const QuadrantArt = memo(function QuadrantArt({ quadrant }: { quadrant: Quadrant }) {
  return (
    <svg viewBox="0 0 24 14" shapeRendering="crispEdges" aria-hidden="true">
      {iconRects(QUADRANT_ART[quadrant]).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
});
