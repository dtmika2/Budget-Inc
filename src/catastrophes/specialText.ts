/** Texts for special cards (catastrophes workspace): condition lines and "in N days". */
import type { SpecialCondition } from '@core/specialCards';
import { fmt, t } from '@i18n/index';

/** Name of the checked value, e.g. a resource, the anger of a group (special.anger) or support in a region (special.region). */
export function conditionName(c: SpecialCondition): string {
  switch (c.type) {
    case 'resource':
      return t(`resource.${c.resource}`);
    case 'anger':
      return t('special.anger', { group: t(`group.${c.group}`) });
    case 'pc':
      return t('special.pc');
    case 'region':
      return t('special.region', { region: t(`region.${c.region}`) });
  }
}

/** A value of the checked quantity with its unit (% for resources and regions). */
export function conditionValue(c: SpecialCondition, v: number): string {
  if (c.type === 'resource' || c.type === 'region') return `${fmt(v)} %`;
  if (c.type === 'pc') return `${fmt(v)} ${t('hud.pc')}`;
  return fmt(v);
}

/** "Finance ≥ 40 %" */
export function conditionText(c: SpecialCondition): string {
  return t(`special.condition.${c.op}`, { name: conditionName(c), v: conditionValue(c, c.value) });
}

/** Today / in 1 day / in 2-4 days / in 5+ days, with Czech plural forms (special.in.*). */
export function inDays(n: number): string {
  if (n <= 0) return t('special.in.today');
  if (n === 1) return t('special.in.one', { n });
  if (n < 5) return t('special.in.few', { n });
  return t('special.in.many', { n });
}
