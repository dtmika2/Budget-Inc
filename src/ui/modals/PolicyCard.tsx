import { memo } from 'react';
import type { PolicyCard as Card } from '@core/types';
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

/** A policy proposal as an official memo. Picking it stamps it. */
export const PolicyCard = memo(function PolicyCard({ card, stamped, onPick }: { card: Card; stamped: boolean; onPick: () => void }) {
  const sim = getStore().sim!;
  const preview = sim.previewCard(card.id);
  return (
    <article className={`memo${stamped ? ' is-stamped' : ''}`} data-leaning={card.leaning}>
      <header className="memo__head">
        <span className="memo__leaning">
          <span className="memo__glyph" aria-hidden="true">
            {LEANING_GLYPH[card.leaning]}
          </span>
          {t(`leaning.${card.leaning}`)}
        </span>
      </header>
      <h3 className="memo__title">{t(card.title)}</h3>
      <p className="memo__desc">{t(card.description)}</p>
      <p className="memo__driven">
        {t('draft.drivenBy')}: <b>{t(card.drivenBy)}</b>
      </p>
      <RangeChips preview={preview} all />
      <button className="btn btn--stamp memo__pick" onClick={onPick} disabled={stamped}>
        {t('draft.pick')}
      </button>
      {stamped && (
        <span className="memo__stamp" aria-hidden="true">
          {t('draft.pick')}
        </span>
      )}
    </article>
  );
});
