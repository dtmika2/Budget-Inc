/** Generic upgrade-tree engine (spec §8): data-driven DAG, effects are modifiers. */
import { instantiate } from './modifiers';
import type { Simulation } from './simulation';
import type { UpgradeNode, UpgradeTree } from './types';

export type NodeStatus = 'owned' | 'available' | 'locked';

export function nodeStatus(owned: readonly string[], node: UpgradeNode): NodeStatus {
  if (owned.includes(node.id)) return 'owned';
  return node.requires.every((r) => owned.includes(r)) ? 'available' : 'locked';
}

/** Trees the current leader has: shared trees plus their own leader tree. */
export function treesFor(sim: Simulation): UpgradeTree[] {
  return sim.data.upgrades.filter((t) => !t.leader || t.leader === sim.state.leader);
}

export function findNode(sim: Simulation, nodeId: string): UpgradeNode | undefined {
  for (const t of treesFor(sim)) {
    const n = t.nodes.find((x) => x.id === nodeId);
    if (n) return n;
  }
  return undefined;
}

export function canBuy(sim: Simulation, nodeId: string): string | null {
  const node = findNode(sim, nodeId);
  if (!node) return 'no such node';
  const status = nodeStatus(sim.state.ownedUpgrades, node);
  if (status === 'owned') return 'already owned';
  if (status === 'locked') return 'prerequisites missing';
  if (sim.state.pc < node.cost) return 'cannot afford';
  return null;
}

export function buyUpgrade(sim: Simulation, nodeId: string): void {
  const node = findNode(sim, nodeId)!;
  sim.state.pc -= node.cost;
  sim.state.ownedUpgrades.push(node.id);
  sim.state.modifiers.push(...instantiate(node.modifiers, `upgrade:${node.id}`));
  sim.log('upgrade_bought', { nodeId, cost: node.cost });
}
