/**
 * Living map layer: pixel actors drawn over the kraje (presentation only). Sprites are defined once in
 * <defs> and placed with <use>. Positions are SVG transform attributes; motion is CSS keyframes that
 * translate by custom properties (--dx/--dy) in whole sprite pixels (steps()), so the global reduced-motion
 * switch freezes everything in place. The layer ignores pointer events, so taps still reach the regions.
 */
import { memo, type CSSProperties } from 'react';
import { config } from '@/config';
import type { GroupId } from '@core/types';
import { useStore, type Actor } from '../store';
import { REGION_BOXES } from './Liquid';
import { REGION_PATHS } from './regionsPath';
import { SPRITES, SPX, spriteRects } from './sprites';

const LABELS = new Map(REGION_PATHS.map((r) => [r.code, r]));

type Vars = CSSProperties & Record<`--${string}`, string>;

const CARGO: Record<string, Vars> = {
  full: { '--cargo': '#efe6cf', '--cargo-dot': '#8f7740' },
  gold: { '--cargo': '#d9b45a', '--cargo-dot': '#fff2a8' },
  empty: { '--cargo': '#6d6577', '--cargo-dot': '#4a4560' },
};
const PLACARD: Record<GroupId | 'chaos', string> = {
  chaos: '#efe6cf',
  oligarchs: '#d9b45a',
  pensioners: '#c9a0dc',
  media: '#7fb3ff',
  eu: '#3f6fd8',
  activists: '#6fc27f',
};
const JACKETS = ['#4a6fa5', '#8f3b4a', '#3f7a52', '#6b5a8e', '#a0703a'];

/** Small deterministic hash (positions / phases that must not change between renders). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Point inside a kraj: its label point plus jitter (u, v in [-1, 1]) scaled by the kraj's size. */
function spot(code: string, u: number, v: number, spread = 0.18): { x: number; y: number } {
  const r = LABELS.get(code)!;
  const b = REGION_BOXES[code];
  return { x: Math.round(r.labelX + u * b.w * spread), y: Math.round(r.labelY + 14 + v * b.h * spread) };
}

const snap = (n: number) => Math.round(n / SPX) * SPX;

/** Sprite frames (two frames alternate via CSS; --fr sets the frame period). */
function Sprite({ name, style }: { name: string; style?: Vars }) {
  const frames = SPRITES[name].length;
  if (frames === 1) return <use href={`#life-${name}-0`} style={style} />;
  return (
    <g style={style}>
      <use href={`#life-${name}-0`} className="life-fa" />
      <use href={`#life-${name}-1`} className="life-fb" />
    </g>
  );
}

/** Sprite definitions; `scale` enlarges them on small screens (the map is drawn much smaller there). */
export const LifeDefs = memo(function LifeDefs({ scale }: { scale: number }) {
  return (
    <defs>
      {Object.entries(SPRITES).flatMap(([name, frames]) =>
        frames.map((grid, i) => (
          <g key={`${name}-${i}`} id={`life-${name}-${i}`} shapeRendering="crispEdges" transform={scale !== 1 ? `scale(${scale})` : undefined}>
            {spriteRects(grid).map((r, j) =>
              r.fill.startsWith('var(') ? (
                <rect key={j} x={r.x} y={r.y} width={r.w} height={r.h} style={{ fill: r.fill }} />
              ) : (
                <rect key={j} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
              ),
            )}
          </g>
        )),
      )}
    </defs>
  );
});

function timing(a: Actor): CSSProperties {
  return { animationDuration: `${a.ttlMs}ms`, animationDelay: `${a.delayMs}ms` };
}

/** 1-2 cows: fade in, walk a few pixels, graze, turn around, walk back, fade out (one cycle = lifetime). */
function Cows({ a }: { a: Actor }) {
  const p = spot(a.region, a.u, a.v * 0.8 + 0.2, 0.22);
  const once: CSSProperties = { ...timing(a), animationIterationCount: 1, animationFillMode: 'both' };
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <g className="life-fade" style={timing(a)}>
        {Array.from({ length: a.n ?? 1 }, (_, i) => {
          const h = hash(`${a.id}-${i}`);
          const dx = snap(18 + (h % 4) * 6);
          return (
            <g key={i} transform={`translate(${i * 16 * SPX - dx / 2} ${i * 3 * SPX})`}>
              <g className="life-walk" style={{ ...once, '--dx': `${dx}px`, animationTimingFunction: `steps(${dx / SPX})` } as Vars}>
                <g className="life-face-r" style={once}>
                  <Sprite name="cow" style={{ '--fr': '0.9s' }} />
                </g>
                <g className="life-face-l" style={once}>
                  <g transform="scale(-1 1)">
                    <Sprite name="cow" style={{ '--fr': '0.9s' }} />
                  </g>
                </g>
              </g>
            </g>
          );
        })}
      </g>
    </g>
  );
}

function Mover({ a }: { a: Actor }) {
  const from = spot(a.region, 0, 0);
  const to = spot(a.to ?? a.region, 0, 0);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(1, Math.round(Math.hypot(dx, dy) / SPX));
  const name = a.kind === 'limo' ? 'limo' : 'truck';
  return (
    <g transform={`translate(${from.x} ${from.y})`}>
      <g className="life-move" style={{ ...timing(a), '--dx': `${dx}px`, '--dy': `${dy}px`, animationTimingFunction: `steps(${steps})` } as Vars}>
        <g className="life-fade" style={timing(a)}>
          <g transform={dx < 0 ? 'scale(-1 1)' : undefined}>
            <Sprite name={name} style={{ ...(a.kind === 'truck' ? CARGO[a.variant ?? 'full'] : {}), '--fr': '0.24s' }} />
          </g>
        </g>
      </g>
    </g>
  );
}

function Crowd({ a }: { a: Actor }) {
  const p = spot(a.region, a.u, a.v);
  const n = a.n ?? 3;
  const gap = 5 * SPX;
  const x0 = -((n - 1) * gap) / 2;
  const placard = PLACARD[(a.variant ?? 'chaos') as GroupId | 'chaos'] ?? PLACARD.chaos;
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <g className="life-fade" style={timing(a)}>
        {Array.from({ length: n }, (_, i) => (
          <g key={i} transform={`translate(${x0 + i * gap} ${i % 2 ? -SPX : 0})`}>
            <Sprite name="protester" style={{ '--placard': placard, '--jacket': JACKETS[(a.id + i) % JACKETS.length], '--fr': `${0.36 + (i % 3) * 0.08}s` }} />
          </g>
        ))}
        <g transform={`translate(${x0 + (n - 1) * gap + 4 * SPX} ${-12 * SPX})`} className="life-blink">
          <Sprite name="shout" />
        </g>
      </g>
    </g>
  );
}

function Blackout({ a }: { a: Actor }) {
  const r = LABELS.get(a.region)!;
  const p = spot(a.region, a.u * 0.6, a.v * 0.6);
  return (
    <g>
      <path d={r.d} fillRule="evenodd" className="life-dark" style={timing(a)} />
      <g transform={`translate(${p.x} ${p.y})`}>
        <g className="life-fade" style={timing(a)}>
          <Sprite name="pylon" />
          <g transform={`translate(${7 * SPX} ${-8 * SPX})`} className="life-zap">
            <Sprite name="bolt" />
          </g>
          <g transform={`translate(${-6 * SPX} ${-5 * SPX}) scale(-1 1)`} className="life-zap life-zap--late">
            <Sprite name="bolt" />
          </g>
        </g>
      </g>
    </g>
  );
}

function Burst({ a }: { a: Actor }) {
  const p = spot(a.region, a.u * 0.7, a.v * 0.7 - 0.6);
  if (a.kind === 'rain') {
    return (
      <g transform={`translate(${p.x} ${p.y})`}>
        <g className="life-move" style={{ ...timing(a), '--dx': `${snap(24)}px`, '--dy': '0px', animationTimingFunction: 'steps(8)' } as Vars}>
          <g className="life-fade" style={timing(a)}>
            <Sprite name="rain" style={{ '--fr': '0.3s' }} />
          </g>
        </g>
      </g>
    );
  }
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <g className="life-fade" style={timing(a)}>
        <Sprite name="firework" style={{ '--fr': '0.32s' }} />
        <g transform={`translate(${-9 * SPX} ${5 * SPX})`}>
          <Sprite name="firework" style={{ '--fr': '0.4s' }} />
        </g>
      </g>
    </g>
  );
}

function ActorView({ a }: { a: Actor }) {
  switch (a.kind) {
    case 'truck':
    case 'limo':
      return <Mover a={a} />;
    case 'crowd':
      return <Crowd a={a} />;
    case 'blackout':
      return <Blackout a={a} />;
    case 'cow':
      return <Cows a={a} />;
    default:
      return <Burst a={a} />;
  }
}

/** Blackouts sit under everything else; then cows and effects, crowds; movers on top. */
const ORDER: Record<Actor['kind'], number> = { blackout: 0, cow: 1, rain: 1, firework: 1, crowd: 2, truck: 3, limo: 3 };

export function MapLife() {
  const actors = useStore((s) => s.ui.actors);
  const mobile = useStore((s) => s.ui.isMobile);
  const sorted = [...actors].sort((x, y) => ORDER[x.kind] - ORDER[y.kind] || x.id - y.id);
  return (
    <g className="life" aria-hidden="true">
      <LifeDefs scale={mobile ? config.life.mobileSpriteScale : 1} />
      {sorted
        .filter((a) => a.kind === 'blackout')
        .map((a) => (
          <ActorView key={a.id} a={a} />
        ))}
      {sorted
        .filter((a) => a.kind !== 'blackout')
        .map((a) => (
          <ActorView key={a.id} a={a} />
        ))}
    </g>
  );
}
