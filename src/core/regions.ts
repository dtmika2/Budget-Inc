/**
 * Region traits (phase 13). A tagged card reacts differently per region: the product of
 * config.regions.traitResponse[trait][tag] over the region's traits and the card's tags.
 */
import type { Config } from '../config';
import type { GameData, GroupId } from './types';
import { GROUP_IDS } from './types';

export interface TraitFactor {
  trait: string;
  tag: string;
  mult: number;
}

/** Every trait x tag factor != 1 that applies to a region for these tags. */
export function traitFactors(data: GameData, cfg: Config, code: string, tags: readonly string[] | undefined): TraitFactor[] {
  if (!tags?.length) return [];
  const traits = data.regionProfiles.regions[code]?.traits ?? [];
  const out: TraitFactor[] = [];
  for (const trait of traits)
    for (const tag of tags) {
      const m = cfg.regions.traitResponse[trait]?.[tag];
      if (m !== undefined && m !== 1) out.push({ trait, tag, mult: m });
    }
  return out;
}

export function traitMult(data: GameData, cfg: Config, code: string, tags: readonly string[] | undefined): number {
  return traitFactors(data, cfg, code, tags).reduce((p, f) => p * f.mult, 1);
}

/** Shares (%) of an interest group in a kraj; they sum to 100. */
export interface Cohort {
  group: GroupId;
  support: number;
  neutral: number;
  anger: number;
}

/**
 * Region screen cohorts (display only, no state): angry share = national anger x the kraj's trait
 * affinity to the group (config.regions.groupAffinity), capped; the rest splits into supporters and
 * neutral by the kraj's regional support s_r.
 */
export function regionCohorts(data: GameData, cfg: Config, code: string, anger: Record<GroupId, number>, regionSupport: number): Cohort[] {
  const traits = data.regionProfiles.regions[code]?.traits ?? [];
  const s = Math.max(0, Math.min(100, regionSupport)) / 100;
  return GROUP_IDS.map((group) => {
    const affinity = traits.reduce((m, tr) => m * (cfg.regions.groupAffinity[tr]?.[group] ?? 1), 1);
    const angry = Math.round(Math.max(0, Math.min(cfg.regions.maxAngryShare, anger[group] * affinity)));
    const support = Math.round((100 - angry) * s);
    return { group, support, neutral: 100 - angry - support, anger: angry };
  });
}
