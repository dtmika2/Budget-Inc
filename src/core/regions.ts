/**
 * Region traits (phase 13). A tagged card reacts differently per region: the product of
 * config.regions.traitResponse[trait][tag] over the region's traits and the card's tags.
 */
import type { Config } from '../config';
import type { GameData } from './types';

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
