/**
 * Effect bundles (plan §3.5). `applyBundle` is used by EVERY source (policy, chaos, response,
 * opportunity, budget vote, ability): roll with the `effects` stream, run every value through the
 * modifier pipeline, clamp, apply budget changes, register ongoing effects, report what happened.
 * `previewBundle` runs the same pipeline on min and max without rolling (card / modal ranges).
 */
import type { Config } from '../config';
import { applyPct, budgetTerm, clonePct } from './budget';
import { angerChange, budgetChangePct, resourceChange, type PipelineCtx } from './modifiers';
import { traitMult } from './regions';
import type { Rng } from './rng';
import type {
  ChangeSource,
  Deltas,
  EffectBundle,
  GameData,
  GameState,
  GroupId,
  OngoingDef,
  Range,
  ResourceId,
} from './types';
import { GROUP_IDS } from './types';

export const NON_FINANCE_RESOURCES: ResourceId[] = ['support', 'coalition', 'prestige'];
const clamp = (v: number) => Math.min(100, Math.max(0, v));

export interface EffectHost {
  readonly state: GameState;
  readonly data: GameData;
  readonly cfg: Config;
  pipeline(): PipelineCtx;
  recomputeFinances(): void;
}

export interface Applied {
  /** Pipeline output per key (`support`, `financesExtra`, `anger.media`, `budget:313:expenditure`). */
  rolled: Record<string, number>;
  /** Actual change of each value (after clamping), Finances included. */
  deltas: Deltas;
}

/** Apply a resource change that has already been through the pipeline. Returns the actual delta. */
export function addResource(state: GameState, res: Exclude<ResourceId, 'finances'>, v: number): number {
  const before = state.resources[res];
  state.resources[res] = clamp(before + v);
  return state.resources[res] - before;
}

export function addAnger(state: GameState, g: GroupId, v: number): number {
  const before = state.anger[g];
  state.anger[g] = clamp(before + v);
  return state.anger[g] - before;
}

export function applyBundle(
  host: EffectHost,
  bundle: EffectBundle,
  source: ChangeSource,
  origin: string,
  rng: Rng,
  fixed = false,
): Applied {
  const { state } = host;
  const ctx = host.pipeline();
  const rolled: Record<string, number> = {};
  const deltas: Deltas = { resources: {}, anger: {} };
  const roll = (r: Range) => (fixed ? r.min : rng.uniform(r.min, r.max));
  const financesBefore = state.resources.finances;
  const angerBefore = { ...state.anger };

  const cap = host.cfg.regions.maxShift;
  const addShift = (code: string, v: number) => {
    const before = state.regionShift[code] ?? 0;
    state.regionShift[code] = Math.min(cap, Math.max(-cap, before + v));
    const d = state.regionShift[code] - before;
    if (d !== 0) (deltas.regions ??= {})[code] = (deltas.regions?.[code] ?? 0) + d;
  };
  const tags = bundle.tags;
  // resources (fixed key order for determinism)
  for (const res of NON_FINANCE_RESOURCES) {
    const r = bundle.effects?.[res];
    if (!r) continue;
    const v = resourceChange(ctx, res, roll(r), source);
    rolled[res] = v;
    const d = addResource(state, res as Exclude<ResourceId, 'finances'>, v);
    deltas.resources[res] = (deltas.resources[res] ?? 0) + d;
    // region traits: a tagged support change lands harder or softer per region (national support unchanged)
    if (res === 'support' && tags?.length && v !== 0) {
      for (const reg of host.data.regions.regions) {
        const m = traitMult(host.data, host.cfg, reg.code, tags);
        if (m !== 1) addShift(reg.code, v * (m - 1));
      }
    }
  }
  const fx = bundle.effects?.financesExtra;
  if (fx) {
    const v = resourceChange(ctx, 'finances', roll(fx), source);
    rolled.financesExtra = v;
    state.financesExtra += v;
  }
  for (const g of GROUP_IDS) {
    const r = bundle.anger?.[g];
    if (!r) continue;
    const v = angerChange(ctx, g, roll(r), source);
    rolled[`anger.${g}`] = v;
    addAnger(state, g, v);
  }
  for (const bc of bundle.budgetChanges ?? []) {
    const pct = budgetChangePct(ctx, bc, source);
    rolled[`budget:${bc.chapter}:${bc.type}`] = (rolled[`budget:${bc.chapter}:${bc.type}`] ?? 0) + pct;
    applyPct(host.data.budget, state.budget, bc.chapter, bc.type, pct);
  }
  // regional support shifts (data order of regions for determinism); a loss is bad like a support loss
  if (bundle.regions) {
    for (const r of host.data.regions.regions) {
      const range = bundle.regions[r.code];
      if (!range) continue;
      const v = resourceChange(ctx, 'support', roll(range), source) * traitMult(host.data, host.cfg, r.code, tags);
      rolled[`region.${r.code}`] = v;
      addShift(r.code, v);
    }
  }
  registerOngoing(state, bundle.ongoing ?? [], source, origin);
  if (bundle.pc) {
    state.pc += bundle.pc;
    deltas.pc = bundle.pc;
  }

  host.recomputeFinances();
  const fd = state.resources.finances - financesBefore;
  if (fd !== 0) deltas.resources.finances = fd;
  for (const g of GROUP_IDS) {
    const d = state.anger[g] - angerBefore[g];
    if (d !== 0) deltas.anger[g] = d;
  }
  return { rolled, deltas };
}

/** Ongoing effects stack across sources; re-applying the same source refreshes its duration (§6.2). */
export function registerOngoing(state: GameState, defs: readonly OngoingDef[], source: ChangeSource, origin: string): void {
  defs.forEach((d, i) => {
    const key = `${origin}#${i}`;
    const existing = state.ongoing.find((o) => o.key === key);
    if (existing) {
      existing.daysLeft = d.days;
      existing.perDay = d.perDay;
    } else {
      state.ongoing.push({ key, origin, source, target: d.target, perDay: d.perDay, daysLeft: d.days, label: d.label });
    }
  });
}

/**
 * Apply one per-day value to a target (`support`, `finances`, `anger.media`), through the pipeline
 * (no roll). A `finances` target adds to the financesExtra term.
 */
export function applyDaily(host: EffectHost, target: string, perDay: number, source: ChangeSource): void {
  const { state } = host;
  const ctx = host.pipeline();
  if (target.startsWith('anger.')) {
    const g = target.slice(6) as GroupId;
    addAnger(state, g, angerChange(ctx, g, perDay, source));
  } else if (target === 'finances') {
    state.financesExtra += resourceChange(ctx, 'finances', perDay, source);
  } else {
    const res = target as Exclude<ResourceId, 'finances'>;
    addResource(state, res, resourceChange(ctx, res, perDay, source));
  }
}

// ---------------------------------------------------------------- preview

export interface PreviewRanges {
  resources: Partial<Record<ResourceId, Range>>;
  anger: Partial<Record<GroupId, Range>>;
  /** Regional support shift ranges per kraj code. */
  regions: Partial<Record<string, Range>>;
  ongoing: OngoingDef[];
  pc: number;
}

const ordered = (a: number, b: number): Range => ({ min: Math.min(a, b), max: Math.max(a, b) });

/** Ranges after modifiers. The Finances range = exact budget delta + financesExtra range. */
export function previewBundle(host: EffectHost, bundle: EffectBundle, source: ChangeSource): PreviewRanges {
  const ctx = host.pipeline();
  const out: PreviewRanges = { resources: {}, anger: {}, regions: {}, ongoing: bundle.ongoing ?? [], pc: bundle.pc ?? 0 };
  for (const res of NON_FINANCE_RESOURCES) {
    const r = bundle.effects?.[res];
    if (r) out.resources[res] = ordered(resourceChange(ctx, res, r.min, source), resourceChange(ctx, res, r.max, source));
  }
  const sup = out.resources.support;
  for (const r of host.data.regions.regions) {
    const m = traitMult(host.data, host.cfg, r.code, bundle.tags);
    const range = bundle.regions?.[r.code];
    let lo = 0;
    let hi = 0;
    if (range) {
      lo = resourceChange(ctx, 'support', range.min, source) * m;
      hi = resourceChange(ctx, 'support', range.max, source) * m;
    }
    if (sup && m !== 1) {
      lo += sup.min * (m - 1);
      hi += sup.max * (m - 1);
    }
    if (range || (sup && m !== 1 && (Math.abs(lo) > 1e-9 || Math.abs(hi) > 1e-9))) out.regions[r.code] = ordered(lo, hi);
  }
  let budgetDelta = 0;
  if (bundle.budgetChanges?.length) {
    const { budget } = host.data;
    const pct = clonePct(host.state.budget);
    const before = budgetTerm(budget, pct, host.cfg.finances.scale);
    for (const bc of bundle.budgetChanges) applyPct(budget, pct, bc.chapter, bc.type, budgetChangePct(ctx, bc, source));
    budgetDelta = budgetTerm(budget, pct, host.cfg.finances.scale) - before;
  }
  const fx = bundle.effects?.financesExtra;
  if (fx || bundle.budgetChanges?.length) {
    const lo = fx ? resourceChange(ctx, 'finances', fx.min, source) : 0;
    const hi = fx ? resourceChange(ctx, 'finances', fx.max, source) : 0;
    const r = ordered(lo + budgetDelta, hi + budgetDelta);
    if (Math.abs(r.min) > 1e-9 || Math.abs(r.max) > 1e-9) out.resources.finances = r;
  }
  for (const g of GROUP_IDS) {
    const r = bundle.anger?.[g];
    if (r) out.anger[g] = ordered(angerChange(ctx, g, r.min, source), angerChange(ctx, g, r.max, source));
  }
  return out;
}
