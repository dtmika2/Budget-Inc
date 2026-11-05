/** Prestige hover: the chance of a prestige bonus this month (P24). */
import { config } from '@/config';
import { prestigeBonusChance } from '@core/prestigeBonus';
import { t } from '@i18n/index';
import { pct } from '../format';
import { useStore } from '../store';

export function PressureNote() {
  const prestige = useStore((s) => Math.round(s.sim?.state.resources.prestige ?? 0));
  return <p className="press__total">{t('pressure.prestigeNote', { from: config.prestigeBonus.from, chance: pct(prestigeBonusChance(config, prestige)) })}</p>;
}
