/** Skill-tree texts derived from data (P29): effect lines from a box's modifiers, and its compass quadrant. */
import type { ModifierDef, UpgradeNode } from '@core/types';
import { fmt, t } from '@i18n/index';

/** A quadrant of the compass, or an axis for the boxes on it (p = Progrese, t = Tradice, l = Levice, r = Pravice). */
export type Quadrant = 'lp' | 'rp' | 'lt' | 'rt' | 'p' | 't' | 'l' | 'r';

/** Quadrant (or axis) of a box on the compass grid. */
export function quadrantOf(n: UpgradeNode, cols = 9, rows = 9): Quadrant {
  const mc = (cols - 1) / 2;
  const mr = (rows - 1) / 2;
  const { col, row } = n.pos;
  if (col === mc) return row < mr ? 'p' : 't';
  if (row === mr) return col < mc ? 'l' : 'r';
  return (col < mc ? 'l' : 'r') + (row < mr ? 'p' : 't') as Quadrant;
}

const pct = (x: number) => fmt(Math.round(Math.abs(x) * 100));

/** What a resource or group in a modifier target is called. */
function what(key: string): string {
  if (key.startsWith('anger.')) return t(`group.${key.split('.')[1]}`);
  return t(`resource.short.${key.split('.')[0]}`);
}

/** One readable line per modifier. */
export function modifierLine(m: ModifierDef): string {
  const tg = m.target;
  if (tg === 'election.T_base') return t('upgrades.fx.threshold', { v: fmt(Math.abs(m.value)) });
  if (tg === 'pc.perQuarter') return t('upgrades.fx.pc', { v: fmt(m.value) });
  if (tg === 'finances.negative') return t('upgrades.fx.negative', { v: pct(1 - m.value) });
  if (/^anger\.[a-z]+\.gain$/.test(tg)) return t('upgrades.fx.angerGain', { what: what(tg), v: pct(1 - m.value) });
  if (tg.endsWith('.gain')) return t('upgrades.fx.gain', { what: what(tg), v: pct(m.value - 1) });
  if (tg.endsWith('.loss')) return t('upgrades.fx.loss', { what: what(tg), v: pct(1 - m.value) });
  if (tg.endsWith('.drift')) return t('upgrades.fx.drift', { what: what(tg), v: pct(1 - m.value) });
  return t('upgrades.fx.other', { what: tg });
}
