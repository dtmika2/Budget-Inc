/**
 * Placeholder pixel-art leader portraits (spec §5.3): generic chunky caricatures drawn from a 16x18
 * character grid, coloured by party, rendered crisp at integer scale. Original art, no likenesses.
 * Replace with the developer's spritesheets later (sprite key in data/leaders.json).
 */
import { memo } from 'react';

const SPRITES: Record<string, string[]> = {
  mupka: [
    '................',
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '...hhhhhsssh....',
    '...hssssssss....',
    '...sgggsgggs....',
    '...sgegsgegs....',
    '...sgggsgggs....',
    '...ssssSssss....',
    '....ssmmmss.....',
    '.....sssss......',
    '...CCwwtwwCC....',
    '..CccwwtwwccC...',
    '.CcccwwtwwcccC..',
    '.CcccwwttwcccC..',
    '.CccccwttwccccC.',
    '.CccccwttwccccC.',
    '.CccccccccccccC.',
  ],
  abis: [
    '................',
    '................',
    '.....ssssss.....',
    '....ssssssss....',
    '...hssssssssh...',
    '...hbbsssbbsh...',
    '...sseesseess...',
    '...ssssssssss...',
    '...sssssSssss...',
    '...ssmmmmmmss...',
    '....ssssssss....',
    '...CCwwtwwCC....',
    '..CccwwtwwccC...',
    '.CcccwwtwwcccC..',
    '.CcccwwttwcccC..',
    '.CccccwttwccccC.',
    '.CccccwttwccccC.',
    '.CccccccccccccC.',
  ],
  // a black pirate-flag pin on the lapel
  brich: [
    '................',
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '...hhhhhhhhhh...',
    '...hssssssssh...',
    '...ssbbssbbss...',
    '...sseesseess...',
    '...ssssssssss...',
    '...sssssSssss...',
    '....ssmmmmss....',
    '.....ssssss.....',
    '...CCwwtwwCC....',
    '..CccwwtwwkxC...',
    '.CcccwwtwwkkcC..',
    '.CcccwwttwcccC..',
    '.CccccwttwccccC.',
    '.CccccwttwccccC.',
    '.CccccccccccccC.',
  ],
  // an orange scarf and leather driving gloves
  moturek: [
    '................',
    '....hhhhhhhh....',
    '...hhhhhhhhhh...',
    '...hhsssssshh...',
    '...hssssssssh...',
    '...sbbbssbbbs...',
    '...sseesseess...',
    '...ssssssssss...',
    '...sssssSssss...',
    '...sssmmmmsss...',
    '....ssssssss....',
    '...ffffffffff...',
    '..CcffwtwwccC...',
    '.CcccfwtwwcccC..',
    '.CcccffttwcccC..',
    '.CccccfttwccccC.',
    'GCccccwttwccccCG',
    'GGccccccccccccGG',
  ],
};

const HAIR: Record<string, string> = { mupka: '#3b2a1f', abis: '#8d8a96', brich: '#2a2a2a', moturek: '#5a3a22' };

function darken(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((n >> s) & 255) * f);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

interface Props {
  sprite: string;
  color: string;
  scale?: number;
  initials?: string;
  animate?: boolean;
}

export const LeaderSprite = memo(function LeaderSprite({ sprite, color, scale = 4, initials, animate = true }: Props) {
  const rows = SPRITES[sprite] ?? SPRITES.mupka;
  const palette: Record<string, string> = {
    h: HAIR[sprite] ?? '#3b2a1f',
    b: HAIR[sprite] ?? '#3b2a1f',
    s: '#e9b58c',
    S: '#c98d66',
    g: '#1c1a24',
    e: '#f5f1e6',
    m: '#8c3b2c',
    w: '#f4f1ea',
    t: '#c8352e',
    c: color,
    C: darken(color, 0.62),
    k: '#111014',
    x: '#f4f1ea',
    f: '#fdba74',
    G: '#3a2414',
  };
  const rects: JSX.Element[] = [];
  rows.forEach((row, y) =>
    row
      .padEnd(16, '.')
      .slice(0, 16)
      .split('')
      .forEach((ch, x) => {
        const fill = palette[ch];
        if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
      }),
  );
  const w = 16 * scale;
  const h = 18 * scale;
  return (
    <div className={`sprite${animate ? ' sprite--idle' : ''}`} style={{ width: w, height: h + (initials ? scale * 4 : 0) }}>
      <svg width={w} height={h} viewBox="0 0 16 18" shapeRendering="crispEdges" aria-hidden="true">
        {rects}
      </svg>
      {initials && (
        <span className="sprite__initials" style={{ background: color, fontSize: Math.max(10, scale * 3) }}>
          {initials}
        </span>
      )}
    </div>
  );
});
