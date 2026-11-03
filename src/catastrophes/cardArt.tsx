/**
 * Pixel-art scenes for special cards (catastrophes workspace), drawn like LeaderSprite: a 24 x 14 character
 * grid, one letter per pixel, rendered crisp. Generic placeholder art, no likenesses. A card picks its
 * scene with `"art"` in data/catastrophes/*.json; unknown or missing art falls back to its kind's default.
 */
import { memo } from 'react';
import type { SpecialKind } from '@core/specialCards';

const W = 24;
const H = 14;

/** Shared colours (same tones as the game palette and LeaderSprite). */
const BASE: Record<string, string> = {
  k: '#1c1a24', // outline
  w: '#efe6cf', // paper
  r: '#c8352e', // red
  R: '#8f201b', // dark red
  y: '#d9b45a', // gold
  Y: '#a8842f', // dark gold
  c: '#8d8a96', // cloud grey
  C: '#5d5a68', // dark grey
  b: '#5f9bd1', // water
  B: '#2f5f99', // deep water
  G: '#6fc27f', // green
  s: '#e9b58c', // skin
  S: '#c98d66', // skin shade
  h: '#3b2a1f', // hair
  g: '#1c1a24', // glasses
  m: '#8c3b2c', // mouth
  t: '#c8352e', // tie
  n: '#2c3a63', // suit
  N: '#1d2742', // suit shade
};

const SCENES: Record<string, string[]> = {
  /** Falling chart with a red arrow and spilled coins. */
  finance_crash: [
    '........................',
    '.k......................',
    '.k.rr...................',
    '.k.rRr..................',
    '.k..rRr.........yy......',
    '.k...rRr.......yYYy.....',
    '.k....rRr......yYYy.....',
    '.k.....rRr......yy......',
    '.k......rRr.............',
    '.k.......rRr..r.........',
    '.k........rRrrr.....yy..',
    '.k.........rRRr....yYYy.',
    '.k..........rrr.....yy..',
    '.kkkkkkkkkkkkkkkkkkkkkkk',
  ],
  /** Storm cloud striking a newspaper. */
  media_storm: [
    '.......CCCCCC...........',
    '.....CCccccccCC.........',
    '....CccccccccccC........',
    '.....CCCCCCCCCC.........',
    '.........yy.............',
    '........yy..............',
    '.......yyyy.............',
    '.........yy.............',
    '..kkkkkkkkkkkkkkkkkk....',
    '..kwwwwwwwwwwwwwwwwk....',
    '..kwkkkkkkwwrrrrrrwk....',
    '..kwkkkkkkwwwwwwwwwk....',
    '..kwwwwwwwwwkkkkkkwk....',
    '..kkkkkkkkkkkkkkkkkk....',
  ],
  /** A house in rising water. */
  flood: [
    '...........kk...........',
    '..........kRRk..........',
    '.........kRRRRk.........',
    '........kRRRRRRk........',
    '.......kRRRRRRRRk.......',
    '........kwwwwwwk........',
    '........kwkkwwwk........',
    '........kwkkwkkk........',
    '........kwwwwkyk........',
    'bbbbbbbbkkkkkkkkbbbbbbbb',
    'BbbBbbBbbBbbBbbBbbBbbBbb',
    'bbbbbbbbbbbbbbbbbbbbbbbb',
    'bBbbBbbBbbBbbBbbBbbBbbBb',
    'BBBBBBBBBBBBBBBBBBBBBBBB',
  ],
  /** Storm cloud with lightning: default catastrophe. */
  storm: [
    '......CCCCCCCC..........',
    '....CCccccccccCC........',
    '...CccccccccccccC.......',
    '...CccccccccccccC.......',
    '....CCCCCCCCCCCC........',
    '.........yy.............',
    '........yy..............',
    '.......yyyyy............',
    '.........yy.............',
    '........yy..............',
    '.......y................',
    '........................',
    'kkkkkkkkkkkkkkkkkkkkkkkk',
    'CCCCCCCCCCCCCCCCCCCCCCCC',
  ],
  /** A diplomat in dark glasses with a briefcase: default agent. */
  diplomat: [
    '.........hhhhhh.........',
    '........hhhhhhhh........',
    '.......hhhhhhhhhh.......',
    '.......hssssssssh.......',
    '.......gggggggggg.......',
    '.......sgggssgggs.......',
    '.......ssssSSssss.......',
    '........ssmmmmss........',
    '.........ssssss.........',
    '.......NNwwtwwNN........',
    '......NnnwwtwwnnN...yy..',
    '.....NnnnwwtwwnnnN.kYYk.',
    '.....NnnnwwttwnnnN.kYYk.',
    '.....NnnnnwttwnnnN.kkkk.',
  ],
  /** An analyst with round glasses next to a rising chart. */
  analyst: [
    '........................',
    '.kkkkkkkkkk.....hhhhh...',
    '.kwwwwwwwwk....hhhhhhh..',
    '.kwwwwwwGwk....hssssss..',
    '.kwwwwwGGwk....gggsggg..',
    '.kwwwwGGGwk....gwgsgwg..',
    '.kwwGwGGGwk....gggSggg..',
    '.kwGGwGGGwk.....smmms...',
    '.kwGGGGGGwk......sss....',
    '.kkkkkkkkkk....NNwtwNN..',
    '.....kk.......NnnwtwnnN.',
    '.....kk......NnnnwttnnnN',
    '....kkkk.....NnnnwttnnnN',
    '.............NnnnnnnnnnN',
  ],
};

const DEFAULT: Record<SpecialKind, string> = { catastrophe: 'storm', agent: 'diplomat' };

export const CardArt = memo(function CardArt({ art, kind, className }: { art?: string; kind: SpecialKind; className?: string }) {
  const rows = SCENES[art ?? ''] ?? SCENES[DEFAULT[kind]];
  const rects: JSX.Element[] = [];
  rows.forEach((row, y) =>
    row
      .padEnd(W, '.')
      .slice(0, W)
      .split('')
      .forEach((ch, x) => {
        const fill = BASE[ch];
        if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
      }),
  );
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" aria-hidden="true">
      {rects}
    </svg>
  );
});
