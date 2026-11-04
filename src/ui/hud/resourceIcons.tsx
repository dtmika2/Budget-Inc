/**
 * Pixel icons of the four resources (top bar): 10 x 10 letter grids, one letter per pixel, drawn as merged
 * SVG rects like the ability icons. Each resource has its own accent colour (A / a = accent and its shade).
 */
import { memo } from 'react';
import type { ResourceId } from '@core/types';
import { RESOURCE_COLOR } from '../colors';

/** Accent colour of each resource (one palette for the whole game: ../colors.ts). */
export const RESOURCE_ACCENT = RESOURCE_COLOR;

const ICONS: Record<ResourceId, string[]> = {
  // a stack of coins
  finances: ['..........', '...AAAA...', '..AaaaaA..', '...AAAA...', '..AaaaaA..', '...AAAA...', '..AaaaaA..', '...AAAA...', '..AAAAAA..', '..........'],
  // a heart
  support: ['..........', '.AA...AA..', 'AWAA.AAAA.', 'AAAAAAAAA.', 'AAAAAAAAA.', '.AAAAAAa..', '..AAAAa...', '...AAa....', '....a.....', '..........'],
  // two linked chain rings
  coalition: ['..........', '.AAA......', 'A...A.....', 'A..aaaa...', 'A..aA..a..', '.AAAA..a..', '...a...a..', '....aaa...', '..........', '..........'],
  // a star
  prestige: ['....A.....', '....A.....', '...AAA....', 'AAAAWAAAA.', '.AAAAAAA..', '..AAAAA...', '..AA.AA...', '.Aa...aA..', '.a.....a..', '..........'],
};

export const ResourceIcon = memo(function ResourceIcon({ id, size = 20 }: { id: ResourceId; size?: number }) {
  const accent = RESOURCE_ACCENT[id];
  const fill: Record<string, string> = { A: accent, a: `color-mix(in srgb, ${accent} 60%, #1d1622)`, W: '#fff8e8' };
  const rects: { x: number; y: number; w: number; f: string }[] = [];
  ICONS[id].forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end++;
      if (row[x] !== '.') rects.push({ x, y, w: end - x, f: fill[row[x]] });
      x = end;
    }
  });
  return (
    <svg className="res-icon" viewBox="0 0 10 10" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true">
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.f} />
      ))}
    </svg>
  );
});
