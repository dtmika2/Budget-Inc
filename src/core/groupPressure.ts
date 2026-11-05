/**
 * Interest-group pressure (P24, stakeholder feedback): a group's anger above config.groupPressure.from
 * drains the key attributes every day, with a fixed weight per group and attribute. Pure helpers for the UI
 * (who drains what, how much) and the daily step for the simulation.
 */
import type { Config } from '../config';
import { applyDaily } from './effects';
import type { Simulation } from './simulation';
import type { GroupId, ResourceId } from './types';
import { GROUP_IDS, RESOURCE_IDS } from './types';

/** How strongly a group's anger is pressing (0 at `from` or below, 1 at anger 100). */
export function pressureLevel(cfg: Config, anger: number): number {
  const { from } = cfg.groupPressure;
  return Math.max(0, Math.min(1, (anger - from) / (100 - from)));
}

/** The weight of a group on an attribute (0 when it has none). */
export const pressureWeight = (cfg: Config, g: GroupId, r: ResourceId): number => cfg.groupPressure.weights[g]?.[r] ?? 0;

/** Attributes a group presses on, with their weights (strongest first). */
export function groupTargets(cfg: Config, g: GroupId): { resource: ResourceId; weight: number }[] {
  return RESOURCE_IDS.map((resource) => ({ resource, weight: pressureWeight(cfg, g, resource) }))
    .filter((x) => x.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

/** Groups pressing on an attribute, with their weights (strongest first). */
export function resourceSources(cfg: Config, r: ResourceId): { group: GroupId; weight: number }[] {
  return GROUP_IDS.map((group) => ({ group, weight: pressureWeight(cfg, group, r) }))
    .filter((x) => x.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

/** Drain per day (a positive number = loss) of one group on one attribute, before modifiers. */
export function drainPerDay(cfg: Config, anger: Record<GroupId, number>, g: GroupId, r: ResourceId): number {
  return cfg.groupPressure.perDayAtMax * pressureWeight(cfg, g, r) * pressureLevel(cfg, anger[g]);
}

/** Total drain per day of every group on one attribute, before modifiers. */
export function totalDrainPerDay(cfg: Config, anger: Record<GroupId, number>, r: ResourceId): number {
  return GROUP_IDS.reduce((s, g) => s + drainPerDay(cfg, anger, g, r), 0);
}

/** Daily step: every pressing group drains its attributes (through the modifier pipeline, source `pressure`). */
export function applyGroupPressure(sim: Simulation): void {
  const { cfg, state } = sim;
  for (const r of RESOURCE_IDS) {
    const d = totalDrainPerDay(cfg, state.anger, r);
    if (d > 0) applyDaily(sim, r, -d, 'pressure');
  }
}
