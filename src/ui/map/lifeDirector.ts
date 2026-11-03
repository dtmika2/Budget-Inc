/**
 * "Living map" director: decides which pixel actors appear on the map, from the game state. Pure TS (no
 * DOM, no React) so it is unit-testable; it never touches the simulation's RNG streams. Presentation only:
 * nothing here feeds back into the game.
 *
 * State -> actor:
 *  - trucks drive between kraje; more of them when finances are high, empty below truckEmptyBelow;
 *    a passed budget vote sends a convoy out of the capital
 *  - protest crowds where regional support is low, for angry groups (placard in the group colour),
 *    on chaos events and on a failed budget vote (in the capital)
 *  - blackouts on chaos events and while finances are low / at the zero penalty
 *  - fireworks / rain clouds over kraje whose regional support moved
 *  - an oligarch limo heading to the capital when oligarchs calm down
 */
import type { Config } from '@/config';
import type { GroupId, LogEntry, ResourceId } from '@core/types';
import { GROUP_IDS } from '@core/types';
import type { Rng } from '@core/rng';

export type ActorKind = 'truck' | 'crowd' | 'blackout' | 'firework' | 'rain' | 'limo';

export interface ActorSpawn {
  kind: ActorKind;
  region: string;
  /** Destination kraj (movers). */
  to?: string;
  /** Visual variant: truck cargo (full/empty/gold), crowd placard group (or 'chaos'). */
  variant?: string;
  /** Position jitter inside the kraj, each in [-1, 1] (scaled by the kraj's size when drawn). */
  u: number;
  v: number;
  /** Crowd size. */
  n?: number;
  /** Real-time lifetime and start delay. */
  ttlMs: number;
  delayMs: number;
  /** Spawned by the ambient (per-day) part, not by an event. */
  ambient?: boolean;
}

export interface LifeContext {
  resources: Record<ResourceId, number>;
  anger: Record<GroupId, number>;
  regionSupport: Record<string, number>;
  zeroFinances: boolean;
  /** Log entries added since the last call. */
  entries: readonly LogEntry[];
  /** Game days elapsed since the last call (0 when only a decision happened). */
  days: number;
  /** The ambient quiet gap has passed (at most one ambient actor is spawned per call). */
  ambient: boolean;
  /** Actors currently on the map. */
  active: readonly { kind: ActorKind; region: string }[];
  regions: readonly string[];
  /** Straight-line distance between two kraje in map units (for mover lifetimes). */
  distance: (a: string, b: string) => number;
  maxActors: number;
}

type LifeConfig = Config['life'];

export function planLife(ctx: LifeContext, rng: Rng, L: LifeConfig, pulseAt: number): ActorSpawn[] {
  const out: ActorSpawn[] = [];
  const room = () => ctx.maxActors - ctx.active.length - out.length;
  const busy = (kind: ActorKind, region: string) => ctx.active.some((a) => a.kind === kind && a.region === region) || out.some((a) => a.kind === kind && a.region === region);
  const jitter = () => ({ u: rng.uniform(-1, 1), v: rng.uniform(-1, 1) });
  const other = (from: string) => {
    const pool = ctx.regions.filter((r) => r !== from);
    return pool.length ? rng.pick(pool) : from;
  };
  const moverMs = (a: string, b: string, speed: number) => Math.max(2500, Math.round((ctx.distance(a, b) / speed) * 1000));
  const crowd = (region: string, variant: string) => {
    if (room() <= 0 || busy('crowd', region)) return;
    out.push({ kind: 'crowd', region, variant, n: rng.int(L.crowdSize.min, L.crowdSize.max), ttlMs: L.crowdMs, delayMs: 0, ...jitter() });
  };
  const blackout = (region: string) => {
    if (room() <= 0 || busy('blackout', region)) return;
    out.push({ kind: 'blackout', region, ttlMs: L.blackoutMs, delayMs: 0, ...jitter() });
  };
  const truck = (from: string, to: string, variant: string, delayMs = 0) => {
    if (room() <= 0) return;
    out.push({ kind: 'truck', region: from, to, variant, ttlMs: moverMs(from, to, L.truckSpeed), delayMs, u: 0, v: 0 });
  };
  const limo = (from: string) => {
    if (room() <= 0 || busy('limo', L.capital) || from === L.capital) return;
    out.push({ kind: 'limo', region: from, to: L.capital, ttlMs: moverMs(from, L.capital, L.limoSpeed), delayMs: 0, u: 0, v: 0 });
  };

  // ---- decisions and events (always shown if there is room)
  for (const e of ctx.entries) {
    if (e.type === 'chaos_fired') {
      blackout(rng.pick(ctx.regions));
      crowd(rng.pick(ctx.regions), 'chaos');
    } else if (e.type === 'budget_vote') {
      if (e.passed) for (let i = 0; i < L.convoy; i++) truck(L.capital, other(L.capital), 'gold', i * L.convoyStaggerMs);
      else crowd(L.capital, 'chaos');
    } else if (e.type === 'zero_penalty_started' && e.resource === 'finances') {
      blackout(rng.pick(ctx.regions));
    }
    for (const [code, d] of Object.entries(e.deltas?.regions ?? {})) {
      if (d === undefined || Math.abs(d) < L.regionFxMin || room() <= 0) continue;
      const kind: ActorKind = d > 0 ? 'firework' : 'rain';
      if (!busy(kind, code)) out.push({ kind, region: code, ttlMs: d > 0 ? L.fireworkMs : L.rainMs, delayMs: 0, ...jitter() });
    }
    const olig = e.deltas?.anger.oligarchs;
    if (olig !== undefined && olig <= -L.limoOnDrop) limo(other(L.capital));
  }

  // ---- ambient, per elapsed game day: at most one, and only after the quiet gap
  const events = out.length;
  for (let day = 0; ctx.ambient && day < ctx.days && room() > 0 && out.length === events; day++) {
    const f = ctx.resources.finances;
    if (rng.next() < L.truckPerDay * (L.truckBase + Math.max(0, f) / 100)) {
      const from = rng.pick(ctx.regions);
      truck(from, other(from), f < L.truckEmptyBelow ? 'empty' : 'full');
    }
    for (const code of ctx.regions) {
      if ((ctx.regionSupport[code] ?? 100) < L.crowdBelow && rng.next() < L.crowdPerDay) crowd(code, 'chaos');
    }
    for (const g of GROUP_IDS) {
      if (ctx.anger[g] >= pulseAt && rng.next() < L.angerCrowdPerDay) crowd(rng.pick(ctx.regions), g);
    }
    if ((ctx.zeroFinances || f < L.blackoutBelow) && rng.next() < L.blackoutPerDay) blackout(rng.pick(ctx.regions));
    if (ctx.anger.oligarchs < L.limoCalmBelow && rng.next() < L.limoPerDay) limo(other(L.capital));
  }
  // keep a single ambient spawn (several rolls can succeed on the same day)
  const ambient = out.slice(events, events + 1).map((a) => ({ ...a, ambient: true }));
  return [...out.slice(0, events), ...ambient];
}
