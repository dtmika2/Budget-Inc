/**
 * Regional events (regions workspace, see REGIONS.md): `perYear` times a year a random kraj gets an event
 * (flood, blackout, demonstrations, factory shutdown, the Ikonicke duo) shown as a "!" pin and an animation
 * over the whole kraj. The spawn days are spread evenly: one random day in each of `perYear` equal slices. Intervene -> onIntervene; ignore or let it expire -> onIgnore. Uses its own RNG stream
 * (`regionEvents`) for spawning and for the bundle rolls, so other systems' rolls are unaffected.
 */
import { resolveSelf } from './demands';
import { applyBundle } from './effects';
import { removeWhere, schedule } from './scheduler';
import type { Simulation } from './simulation';
import type { OpenRegionEvent, RegionEventTemplate, ScheduledEntry } from './types';

const rngOf = (sim: Simulation) => sim.rng.regionEvents;

/** At each year-start quarter: `perYear` spawn days, one in each equal slice of the year's window. */
export function scheduleYearRegionEvents(sim: Simulation): void {
  const { cfg, state, data } = sim;
  const c = cfg.regionEvents;
  if (!c.enabled || c.perYear <= 0 || data.regionEvents.length === 0 || !cfg.time.yearStartQuarters.includes(state.quarter)) return;
  const start = sim.absDayOf(state.quarter, 1);
  const lastDay = sim.absDayOf(cfg.time.quarters, cfg.time.daysPerQuarter);
  const from = start + c.spawnFromDay;
  const to = Math.min(start + 4 * cfg.time.daysPerQuarter - c.spawnBeforeYearEnd, lastDay - c.responseDays);
  if (to < from) return;
  const slice = (to - from + 1) / c.perYear;
  for (let i = 0; i < c.perYear; i++) {
    const a = from + Math.floor(i * slice);
    const b = Math.max(a, from + Math.floor((i + 1) * slice) - 1);
    schedule(state, 'regionEventSpawn', rngOf(sim).int(a, b), {});
  }
}

export const regionEventTemplate = (sim: Simulation, id: string): RegionEventTemplate => sim.data.regionEvents.find((t) => t.id === id)!;

/** The text key of an open event (its variant's text when it has one). */
export function regionEventText(sim: Simulation, ev: Pick<OpenRegionEvent, 'templateId' | 'variant'>): string {
  const tpl = regionEventTemplate(sim, ev.templateId);
  return tpl.variants.find((v) => v.id === ev.variant)?.text ?? tpl.text;
}

export function spawnRegionEvent(sim: Simulation, entry: ScheduledEntry): void {
  const { state, data, cfg } = sim;
  const rng = rngOf(sim);
  // a random kraj without an open event (the payload may name one, e.g. in tests)
  const free = data.regions.regions.map((r) => r.code).filter((code) => !state.regionEvents.some((e) => e.region === code));
  const region = entry.payload.region ? String(entry.payload.region) : free.length ? rng.pick(free) : '';
  if (!region || !free.includes(region)) {
    sim.log('region_event_skipped', { region, reason: 'open' });
    return;
  }
  const traits = data.regionProfiles.regions[region]?.traits ?? [];
  const weights = data.regionEvents.map((t) => traits.reduce((w, tr) => w * (t.regionWeights[tr] ?? 1), 1));
  if (!weights.some((w) => w > 0)) {
    sim.log('region_event_skipped', { region, reason: 'noTemplate' });
    return;
  }
  const tpl = data.regionEvents[rng.weightedIndex(weights)];
  const variant = tpl.variants.length ? rng.pick(tpl.variants).id : null;
  const now = sim.absDay;
  const ev: OpenRegionEvent = { id: `rev${state.regionEventSeq++}`, templateId: tpl.id, region, variant, spawnAbsDay: now, expireAbsDay: now + cfg.regionEvents.responseDays };
  state.regionEvents.push(ev);
  schedule(state, 'regionEventExpire', ev.expireAbsDay, { eventId: ev.id });
  sim.log('region_event_spawned', { eventId: ev.id, templateId: tpl.id, region, variant, animation: tpl.animation });
}

/** PC an intervention costs (a negative `pc` in onIntervene). */
export const interveneCost = (tpl: RegionEventTemplate) => Math.max(0, -(tpl.onIntervene.pc ?? 0));

export function canAnswerRegionEvent(sim: Simulation, eventId: string, intervene: boolean): string | null {
  if (sim.state.phase !== 'running') return 'not running';
  const ev = sim.state.regionEvents.find((e) => e.id === eventId);
  if (!ev) return 'no such region event';
  if (intervene && interveneCost(regionEventTemplate(sim, ev.templateId)) > sim.state.pc) return 'cannot afford intervention';
  return null;
}

function take(sim: Simulation, eventId: string): OpenRegionEvent | null {
  const { state } = sim;
  const i = state.regionEvents.findIndex((e) => e.id === eventId);
  if (i < 0) return null;
  const [ev] = state.regionEvents.splice(i, 1);
  removeWhere(state, (e) => e.kind === 'regionEventExpire' && e.payload.eventId === eventId);
  return ev;
}

function resolve(sim: Simulation, ev: OpenRegionEvent, intervene: boolean, timedOut: boolean): void {
  const tpl = regionEventTemplate(sim, ev.templateId);
  const bundle = resolveSelf(intervene ? tpl.onIntervene : tpl.onIgnore, ev.region);
  const { deltas } = applyBundle(sim, bundle, 'region_event', `region_event:${tpl.id}`, rngOf(sim));
  const info = { eventId: ev.id, templateId: tpl.id, region: ev.region, variant: ev.variant };
  if (intervene) sim.log('region_event_intervened', info, deltas);
  else sim.log('region_event_ignored', { ...info, timedOut }, deltas);
}

export function interveneRegionEvent(sim: Simulation, eventId: string): void {
  const ev = take(sim, eventId);
  if (ev) resolve(sim, ev, true, false);
}

export function ignoreRegionEvent(sim: Simulation, eventId: string): void {
  const ev = take(sim, eventId);
  if (ev) resolve(sim, ev, false, false);
}

/** The pin ran out: counts as ignored. */
export function expireRegionEvent(sim: Simulation, entry: ScheduledEntry): void {
  const ev = take(sim, String(entry.payload.eventId));
  if (ev) resolve(sim, ev, false, true);
}
