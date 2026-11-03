/**
 * News and response pop-ups (spec §7.2, §7.3). At most 3 visible on desktop / 2 on mobile; the rest
 * queue. Respondable pop-ups take priority and are never pushed out by news.
 */
import { memo } from 'react';
import { config } from '@/config';
import { t } from '@i18n/index';

import { getStore, useStore, visiblePopups, type Popup } from '@ui/store';
import { DeltaList } from '@ui/popups/DeltaList';
import { RangeChips } from '@ui/modals/RangeChips';

function popupText(p: Popup): string {
  if (!p.textKey) return '';
  const params: Record<string, string | number> = { ...(p.params ?? {}) };
  for (const [k, key] of Object.entries(p.keyParams ?? {})) params[k] = t(key);
  return t(p.textKey, params);
}

const NewsPopup = memo(function NewsPopup({ p }: { p: Popup }) {
  const store = getStore();
  return (
    <div className={`popup popup--news popup--${p.tone}`} role="status">
      <button className="popup__body" onClick={() => store.dismissPopup(p.id)}>
        <span className="popup__title">{t(p.titleKey)}</span>
        <span className="popup__text">{popupText(p)}</span>
        {p.deltas && <DeltaList deltas={p.deltas} />}
      </button>
      <span className="popup__timer" style={{ transform: `scaleX(${p.remainingMs / p.totalMs})` }} />
    </div>
  );
});

function ResponsePopup({ p }: { p: Popup }) {
  const store = getStore();
  const sim = store.sim!;
  const pc = useStore((s) => s.sim?.state.pc ?? 0);
  const ev = sim.eventById.get(p.eventId!);
  if (!ev?.responses) return null;
  const secs = Math.ceil(p.remainingMs / 1000);
  return (
    <div className="popup popup--response" role="alertdialog" aria-label={t('response.title')}>
      <div className="popup__head">
        <span className="popup__title">{t('response.title')}</span>
        <span className="popup__countdown" aria-live="off">
          {t('response.seconds', { s: secs })}
        </span>
      </div>
      <span className="popup__text">{popupText(p)}</span>
      {p.deltas && <DeltaList deltas={p.deltas} />}
      <div className="popup__actions">
        {ev.responses.options.map((o) => {
          const preview = sim.previewResponse(ev.id, o.id);
          const affordable = o.cost.pc <= pc;
          const isDefault = o.id === ev.responses!.default;
          return (
            <button key={o.id} className="btn btn--response" disabled={!affordable} onClick={() => store.respond(p.id, o.id)}>
              <span className="btn-response__label">
                {t(o.label)}
                {isDefault && <em> ({t('response.default')})</em>}
              </span>
              {o.cost.pc > 0 && <span className="btn-response__cost">{t('common.pc', { n: o.cost.pc })}</span>}
              <RangeChips preview={preview} compact />
            </button>
          );
        })}
      </div>
      <span className="popup__timer popup__timer--response" style={{ transform: `scaleX(${p.remainingMs / p.totalMs})` }} />
    </div>
  );
}

export function PopupStack() {
  const isMobile = useStore((s) => s.ui.isMobile);
  const popups = useStore((s) => s.ui.popups);
  const max = isMobile ? config.popups.maxVisibleMobile : config.popups.maxVisibleDesktop;
  const visible = visiblePopups(popups, max);
  const queued = popups.length - visible.length;
  return (
    <div className="popups" aria-live="polite">
      {visible.map((p) => (p.kind === 'response' ? <ResponsePopup key={p.id} p={p} /> : <NewsPopup key={p.id} p={p} />))}
      {queued > 0 && <span className="popups__queued">+{queued}</span>}
    </div>
  );
}
