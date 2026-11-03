/** Panel of the special-card preview page: one button per card, replay, and a shareable link. */
import { useState } from 'react';
import { forceOpenSpecial, forceWarning } from '@core/specialCards';
import { t } from '@i18n/index';
import { getStore } from '@ui/store';

/** Open `cardId` now (restarting its animation) and put it in the address bar. */
export function openPreviewCard(cardId: string): boolean {
  const store = getStore();
  if (!store.sim || !forceOpenSpecial(store.sim, cardId)) return false;
  store.emit();
  const url = new URL(location.href);
  url.searchParams.set('card', cardId);
  history.replaceState(null, '', url);
  return true;
}

export function PreviewPanel() {
  const store = getStore();
  const [current, setCurrent] = useState(() => new URLSearchParams(location.search).get('card') ?? store.data?.specialCards[0]?.id ?? '');
  const cards = store.data?.specialCards ?? [];
  const open = (id: string) => {
    if (openPreviewCard(id)) setCurrent(id);
  };
  return (
    <aside className="special-preview" aria-label={t('special.preview.title')}>
      <h2 className="special-preview__title">{t('special.preview.title')}</h2>
      <ul className="special-preview__list">
        {cards.map((c) => (
          <li key={c.id}>
            <button className={`special-preview__card special-preview__card--${c.kind}${c.id === current ? ' is-on' : ''}`} onClick={() => open(c.id)}>
              <span aria-hidden="true">{c.kind === 'catastrophe' ? '!' : '★'}</span>
              {t(c.title)}
            </button>
          </li>
        ))}
      </ul>
      <div className="special-preview__actions">
        <button className="btn" onClick={() => current && open(current)} disabled={!current}>
          {t('special.preview.replay')}
        </button>
        <button
          className="btn"
          disabled={!current}
          onClick={() => {
            if (store.sim && current && forceWarning(store.sim, current, 3)) store.emit();
          }}
        >
          {t('special.preview.warning')}
        </button>
      </div>
    </aside>
  );
}
