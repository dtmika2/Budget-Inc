import { memo } from 'react';
import type { CompromiseCard, PolicyCard as Card } from '@core/types';
import { t } from '@i18n/index';
import { pledgesForCard, pledgesForCompromise } from '@core/demands';
import { getStore } from '../store';
import { EffectLanes } from './EffectLanes';

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
 * A card as an official memo. Policies (draft) are "prosazeny" (stamped PROSADIT); regional compromises
 * (their own decision, two against each other) have no leaning and are "ucinit kompromis" (KOMPROMIS).
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
  const pledges = isCompromise ? pledgesForCompromise(sim, card.id) : pledgesForCard(sim, card.id);
  const topic = 'topic' in card && card.topic ? t(card.topic) : null;
  const desc = t(card.description);
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
      {/* a card with a topic: the topic is the headline and the name a smaller flavour line */}
      <h3 className="memo__title">{topic ?? t(card.title)}</h3>
      {topic && <p className="memo__flavor">{t(card.title)}</p>}
      {desc && <p className="memo__desc">{desc}</p>}
      <EffectLanes preview={preview} chaos={card.chaosEvents?.length ?? 0} />
      {pledges.map((p) => (
        <p key={p.id} className="memo__pledge">
          {t('pledge.badge', { region: t(`region.short.${p.region}`) })}
        </p>
      ))}
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
