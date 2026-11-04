/**
 * One colour per resource and per interest group, used everywhere they appear (phase 20): top-bar tiles,
 * charts, anger meters, effect chips, hover cards, map placards. Nine distinct hues on the dark ground,
 * so a resource and a group never share a colour.
 */
import type { GroupId, ResourceId } from '@core/types';

export const RESOURCE_COLOR: Record<ResourceId, string> = {
  finances: '#e2b84a',
  support: '#ec6f8e',
  coalition: '#a78bfa',
  prestige: '#5fb2f0',
};

export const GROUP_COLOR: Record<GroupId, string> = {
  oligarchs: '#e0873a',
  pensioners: '#d8ccb2',
  media: '#45c9b8',
  eu: '#4b6fe0',
  activists: '#6fc27f',
};

/** Colour of a "resource or group" target string: `support`, `anger.media`, `support.loss`, ... */
export function targetColor(target: string): string | undefined {
  const m = /^anger\.(\w+)/.exec(target);
  if (m) return GROUP_COLOR[m[1] as GroupId];
  return RESOURCE_COLOR[target.split('.')[0] as ResourceId];
}
