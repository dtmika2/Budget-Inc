/**
 * A list that never scrolls (phase 20): it measures the space it gets and shows as many fixed-height rows
 * as fit, with a small page switcher when there are more. Page 1 holds the newest rows.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '@i18n/index';

const PAGER_H = 34;

export function Paged<T>({ items, rowHeight, gap = 6, render, empty }: { items: T[]; rowHeight: number; gap?: number; render: (item: T) => ReactNode; empty: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [page, setPage] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  const fitAll = Math.max(1, Math.floor((height + gap) / (rowHeight + gap)));
  const perPage = items.length > fitAll ? Math.max(1, Math.floor((height - PAGER_H + gap) / (rowHeight + gap))) : fitAll;
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const p = Math.min(page, pages - 1);
  const shown = items.slice(p * perPage, (p + 1) * perPage);
  return (
    <div ref={ref} className="paged">
      {items.length === 0 ? (
        <p className="panel__empty">{empty}</p>
      ) : (
        <>
          <ul className="paged__list" style={{ gap }}>
            {shown.map((it, i) => (
              <li key={p * perPage + i} style={{ height: rowHeight }}>
                {render(it)}
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="paged__pager">
              <button className="btn-icon" disabled={p === 0} onClick={() => setPage(p - 1)} aria-label={t('panel.newer')}>
                {'‹'}
              </button>
              <span>{t('panel.page', { n: p + 1, of: pages })}</span>
              <button className="btn-icon" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} aria-label={t('panel.older')}>
                {'›'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
