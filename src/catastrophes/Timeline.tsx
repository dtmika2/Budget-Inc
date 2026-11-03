/**
 * Event timeline in the top right (catastrophes workspace): one quarter back, three ahead, moving with the
 * days. Known items (quarter starts, budget votes, the election) are always shown; chaos events show as
 * '?' until they are revealed a quarter ahead, then flip and announce themselves with a notification under
 * the strip. Catastrophes and agents are surprises: they appear only once they happened. Past items keep
 * their outcome.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { config } from '@/config';
import { specialCard } from '@core/specialCards';
import { timelineItems, timelineWindow, type TimelineItem } from '@core/timeline';
import { t } from '@i18n/index';
import { getStore, useStore } from '@ui/store';
import type { Simulation } from '@core/simulation';
import { CardArt } from './cardArt';
import { conditionText, inDays } from './specialText';

/** 7 x 7 pixel icons: one letter per pixel, 'x' = filled. */
const ICONS: Record<string, string[]> = {
  unknown: ['..xxx..', '.x...x.', '.....x.', '...xx..', '...x...', '.......', '...x...'],
  chaos: ['...xx..', '..xx...', '.xx....', '.xxxxx.', '...xx..', '..xx...', '.xx....'],
  budgetVote: ['.xxxxx.', '.x...x.', '.x.x.x.', '.x...x.', 'xxxxxxx', 'x.....x', 'xxxxxxx'],
  election: ['x.....x', 'xx...xx', 'x.x.x.x', 'x..x..x', 'x.....x', 'x.....x', 'xxxxxxx'],
  catastrophe: ['...x...', '...x...', '...x...', '...x...', '...x...', '.......', '...x...'],
  agent: ['...x...', '..xxx..', 'xxxxxxx', '.xxxxx.', '..xxx..', '.xx.xx.', 'x.....x'],
};

function PixelIcon({ name }: { name: string }) {
  const rows = ICONS[name] ?? ICONS.unknown;
  return (
    <svg viewBox="0 0 7 7" width="14" height="14" shapeRendering="crispEdges" aria-hidden="true">
      {rows.flatMap((r, y) => r.split('').map((c, x) => (c === 'x' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" /> : null)))}
    </svg>
  );
}

function ago(n: number): string {
  if (n <= 0) return t('special.in.today');
  return t(n === 1 ? 'timeline.ago.one' : 'timeline.ago.many', { n });
}

/** What the item is (or '?') and a detail line, for the tooltip and the notification. */
function describe(sim: Simulation, it: TimelineItem): { name: string; detail?: string } {
  if (!it.revealed) return { name: t('timeline.unknown') };
  switch (it.kind) {
    case 'quarter':
      return { name: t('timeline.quarter', { q: it.ref ?? '' }) };
    case 'budgetVote':
      return { name: t('timeline.budgetVote'), detail: it.outcome ? t(it.outcome === 'passed' ? 'timeline.vote.passed' : 'timeline.vote.failed') : undefined };
    case 'election':
      return { name: t('timeline.election') };
    case 'chaos': {
      const ev = sim.eventById.get(it.ref ?? '');
      return { name: t('timeline.chaos'), detail: ev ? t(ev.text) : undefined };
    }
    case 'catastrophe':
    case 'agent': {
      const card = specialCard(sim, it.ref ?? '');
      if (!card) return { name: t(`special.kind.${it.kind}`) };
      const check = conditionText(card.condition);
      return {
        name: `${t(`special.kind.${it.kind}`)}: ${t(card.title)}`,
        detail: it.outcome ? `${check} · ${t(it.outcome === 'passed' ? 'special.passed' : 'special.failed')}` : `${t('special.check')}: ${check}`,
      };
    }
  }
}

function iconOf(it: TimelineItem): string {
  return it.revealed ? it.kind : 'unknown';
}

interface Toast {
  id: string;
  item: TimelineItem;
}

export function Timeline() {
  const store = getStore();
  // primitive key: re-render when the day, the schedule or the log changes
  const key = useStore((s) => {
    const st = s.sim?.state;
    return st ? `${st.runId}|${s.sim!.absDay}|${st.specials.upcoming.length}|${st.schedule.length}|${st.log.length}|${st.phase}` : '';
  });
  const sim = store.sim;
  const items = useMemo(() => (sim && key ? timelineItems(sim) : []), [sim, key]);
  const runId = sim?.state.runId ?? '';

  // reveal detection: items that turn from '?' into a known card get a flash and a notification
  const seen = useRef<{ runId: string; ids: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const revealedNow = items.filter((i) => !i.past && i.revealed && (i.kind === 'catastrophe' || i.kind === 'agent' || i.kind === 'chaos'));
    if (!seen.current || seen.current.runId !== runId) {
      // first look at this run: what is already revealed is not news
      seen.current = { runId, ids: new Set(revealedNow.map((i) => i.id)) };
      setToasts([]);
      return;
    }
    const known = seen.current.ids;
    const news = revealedNow.filter((i) => !known.has(i.id));
    if (!news.length) return;
    for (const n of news) known.add(n.id);
    setFresh((f) => new Set([...f, ...news.map((n) => n.id)]));
    setToasts((ts) => [...ts, ...news.map((item) => ({ id: item.id, item }))].slice(-3));
    const ids = news.map((n) => n.id);
    window.setTimeout(() => setFresh((f) => new Set([...f].filter((x) => !ids.includes(x)))), 1600);
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => !ids.includes(x.id))), config.timeline.toastSeconds * 1000);
  }, [items, runId]);

  if (!sim || !key) return null;
  const w = timelineWindow(sim);
  const span = w.to - w.from;
  const x = (d: number) => `${((d - w.from) / span) * 100}%`;

  // two rows for events so neighbours do not cover each other; anchors (votes, election) on their own row
  let lastEvent = -Infinity;
  let row = 0;
  const minGap = span * 0.05;
  const placed = items
    .filter((i) => i.kind !== 'quarter')
    .map((i) => {
      if (i.kind === 'budgetVote' || i.kind === 'election') return { i, cls: 'tl-item--anchor' };
      row = i.absDay - lastEvent < minGap ? 1 - row : 0;
      lastEvent = i.absDay;
      return { i, cls: `tl-item--row${row}` };
    });

  return (
    <div className="timeline" aria-label={t('timeline.title')}>
      <div className="timeline__strip">
        {items
          .filter((i) => i.kind === 'quarter')
          .map((q) => (
            <span key={q.id} className="tl-quarter" style={{ left: x(q.absDay) }}>
              {(q.absDay - w.from) / span < 0.95 && <span className="tl-quarter__label">Q{q.ref}</span>}
            </span>
          ))}
        <span className="tl-now" style={{ left: x(w.now) }} aria-hidden="true" />
        {placed.map(({ i, cls }) => {
          const d = describe(sim, i);
          const when = i.past ? ago(w.now - i.absDay) : inDays(i.absDay - w.now);
          const label = [d.name, when, d.detail].filter(Boolean).join(' · ');
          return (
            <button
              key={i.id}
              className={`tl-item ${cls} tl-item--${i.revealed ? i.kind : 'unknown'}${i.past ? ' is-past' : ''}${fresh.has(i.id) ? ' is-fresh' : ''}${i.outcome ? ` is-${i.outcome}` : ''}`}
              style={{ left: x(i.absDay) }}
              aria-label={label}
            >
              <PixelIcon name={iconOf(i)} />
              <span className="tl-tip" role="tooltip">
                <b>{d.name}</b>
                <span>{when}</span>
                {d.detail && <span>{d.detail}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {toasts.length > 0 && (
        <ul className="timeline__toasts" aria-live="polite">
          {toasts.map(({ id, item }) => {
            const d = describe(sim, item);
            const card = item.kind === 'catastrophe' || item.kind === 'agent' ? specialCard(sim, item.ref ?? '') : undefined;
            return (
              <li key={id} className={`tl-toast tl-toast--${item.kind}`}>
                {card ? <CardArt art={card.art} kind={card.kind} className="tl-toast__art" /> : <PixelIcon name={item.kind} />}
                <span className="tl-toast__text">
                  <b>{t('timeline.revealed')}</b>
                  <span>
                    {d.name} · {inDays(item.absDay - sim.absDay)}
                  </span>
                  {d.detail && <span className="tl-toast__detail">{d.detail}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
