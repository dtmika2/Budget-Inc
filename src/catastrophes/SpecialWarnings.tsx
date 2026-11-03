/** Banner on the map: special cards announced `warnDays` ahead, with what they will check. */
import { visibleWarnings } from '@core/specialCards';
import { t } from '@i18n/index';
import { getStore, useStore } from '@ui/store';
import { conditionText, inDays } from './specialText';

export function SpecialWarnings() {
  const sim = getStore().sim;
  // primitive key: re-render when the set of warnings or their day counts change
  const key = useStore((s) =>
    s.sim
      ? visibleWarnings(s.sim)
          .map((w) => `${w.id}:${w.daysLeft}`)
          .join('|')
      : '',
  );
  if (!sim || !key) return null;
  const warnings = visibleWarnings(sim);
  return (
    <ul className="special-warnings" aria-label={t('special.warnings')}>
      {warnings.map((w) => (
        <li key={w.id} className={`special-warning special-warning--${w.card.kind}`}>
          <span className="special-warning__icon" aria-hidden="true">
            {w.card.kind === 'catastrophe' ? '!' : '★'}
          </span>
          <span className="special-warning__text">
            <b>
              {t(`special.kind.${w.card.kind}`)} {inDays(w.daysLeft)}
            </b>
            <span>{conditionText(w.card.condition)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
