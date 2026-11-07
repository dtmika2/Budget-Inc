/**
 * The one hover card of the game HUD (phase 19): resources, interest groups and leader abilities all
 * explain themselves the same way. Hover or keyboard focus shows a card with an icon, a title in the
 * item's accent colour, a short description, a value line and optional extra content. It is rendered in a
 * portal with fixed positioning, so scroll areas and the dock never clip it; it opens below the item when
 * there is room, otherwise above, and stays inside the window.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface HoverInfo {
  icon?: ReactNode;
  title: string;
  /** Accent colour of the title and the card's edge. */
  accent?: string;
  desc?: string;
  /** Big value on the right of the title (e.g. "48"). */
  value?: string;
  valueColor?: string;
  /** A small status line under the description (e.g. the zone of a value or whether an ability is ready). */
  status?: string;
  /** Extra content (preview chips, a hint). */
  extra?: ReactNode;
  /** A short hint at the bottom (e.g. "Klikni pro podrobnosti"). */
  hint?: string;
}

const GAP = 8;
const MARGIN = 8;

export function HoverCard({
  info,
  children,
  className,
  as: Tag = 'span',
  focusable = false,
  muted = false,
}: {
  info: HoverInfo;
  children: ReactNode;
  className?: string;
  as?: 'span' | 'li' | 'div';
  /** The wrapper itself takes keyboard focus (for content with no button or link of its own). */
  focusable?: boolean;
  /** Hold the card back (something else explains the item right now). */
  muted?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !ref.current || !card.current) return;
    const r = ref.current.getBoundingClientRect();
    const c = card.current.getBoundingClientRect();
    const below = r.bottom + GAP + c.height <= window.innerHeight - MARGIN;
    const top = below ? r.bottom + GAP : Math.max(MARGIN, r.top - GAP - c.height);
    const left = Math.min(Math.max(MARGIN, r.left + r.width / 2 - c.width / 2), window.innerWidth - MARGIN - c.width);
    setPos({ left, top });
  }, [open, info.value, info.status]);

  const show = () => setOpen(true);
  const hide = () => {
    setOpen(false);
    setPos(null);
  };
  return (
    <Tag
      ref={ref as never}
      className={`hc${className ? ` ${className}` : ''}`}
      tabIndex={focusable ? 0 : undefined}
      onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open &&
        !muted &&
        createPortal(
          <div
            ref={card}
            className="hovercard"
            role="tooltip"
            style={{
              ['--hc-accent' as string]: info.accent ?? 'var(--gold)',
              left: pos?.left ?? -9999,
              top: pos?.top ?? -9999,
              visibility: pos ? 'visible' : 'hidden',
            }}
          >
            <div className="hovercard__head">
              {info.icon && <span className="hovercard__icon">{info.icon}</span>}
              <b className="hovercard__title">{info.title}</b>
              {info.value && (
                <b className="hovercard__value" style={info.valueColor ? { color: info.valueColor } : undefined}>
                  {info.value}
                </b>
              )}
            </div>
            {info.desc && <p className="hovercard__desc">{info.desc}</p>}
            {info.status && <p className="hovercard__status">{info.status}</p>}
            {info.extra}
            {info.hint && <p className="hovercard__hint">{info.hint}</p>}
          </div>,
          document.body,
        )}
    </Tag>
  );
}
