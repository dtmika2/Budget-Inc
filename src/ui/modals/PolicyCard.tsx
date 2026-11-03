import { memo } from 'react';
import type { CompromiseCard, PolicyCard as Card } from '@core/types';
import { t } from '@i18n/index';
import { getStore } from '../store';
import { RangeChips } from './RangeChips';

const LEANING_GLYPH: Record<string, string> = {
  libertarianism: '⚖',
  conservatism: '⌂',
  populism: '☺',
  socialism: '⚒',
  progressivism: '✿',
  fascism: '☠',
  communism: '★',
};

/**
 * A draft card as an official memo. Policies are "prosazeny" (stamped PROSADIT); regional compromises
 * have no leaning and are "ucinit kompromis" (stamped KOMPROMIS).
 */
export const PolicyCard = memo(function PolicyCard({
  card,
  stamped,
  onPick,
}: {
  card: Card | CompromiseCard;
  stamped: boolean;
  onPick: () => void;
}) {
  const sim = getStore().sim!;
  const preview = sim.previewCard(card.id);
  const isCompromise = !('leaning' in card);
  const action = isCompromise ? t('draft.compromise') : t('draft.pick');
  return (
    <article className={`memo${isCompromise ? ' memo--compromise' : ''}${stamped ? ' is-stamped' : ''}`} data-leaning={isCompromise ? undefined : card.leaning}>
      <header className="memo__head">
        <span className="memo__leaning">
          <span className="memo__glyph" aria-hidden="true">
            {isCompromise ? '⇄' : LEANING_GLYPH[card.leaning]}
          </span>
          {isCompromise ? t('draft.compromiseTag') : t(`leaning.${card.leaning}`)}
        </span>
      </header>
      <h3 className="memo__title">{t(card.title)}</h3>
      <p className="memo__desc">{t(card.description)}</p>
      <p className="memo__driven">
        {t('draft.drivenBy')}: <b>{t(card.drivenBy)}</b>
      </p>
      <RangeChips preview={preview} all />
      <button className={`btn memo__pick ${isCompromise ? 'btn--compromise' : 'btn--stamp'}`} onClick={onPick} disabled={stamped}>
        {action}
      </button>
      {stamped && (
        <span className="memo__stamp" aria-hidden="true">
          {isCompromise ? t('draft.compromiseStamp') : t('draft.pick')}
        </span>
      )}
    </article>
  );
});
