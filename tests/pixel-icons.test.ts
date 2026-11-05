import { describe, expect, it } from 'vitest';
import { iconRects } from '../src/ui/abilityIcons';
import { PIXEL_ICONS } from '../src/ui/pixelIcons';

describe('pixel icons', () => {
  it.each(Object.entries(PIXEL_ICONS))('%s is a 10 x 10 grid of known colours', (_name, grid) => {
    expect(grid).toHaveLength(10);
    for (const row of grid) expect(row).toHaveLength(10);
    expect(iconRects(grid).length).toBeGreaterThan(0);
  });
});
