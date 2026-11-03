/**
 * The old Public Support tree (prerequisite-style, no start nodes) as a fixture: the engine and modifier
 * pipeline tests use it so they do not depend on the skill tree being designed in data/upgrades.
 */
import { upgradeTreeSchema } from '../../src/data/schemas';
import type { GameData, UpgradeTree } from '../../src/core/types';
import { gameData } from '../helpers';
import raw from './support-tree.json';

export const supportTree = upgradeTreeSchema.parse(raw) as UpgradeTree;

/** Game data whose only upgrade tree is the fixture support tree. */
export function withSupportTree(): GameData {
  return { ...gameData(), upgrades: [supportTree] };
}
