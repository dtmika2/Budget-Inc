/**
 * Generic upgrade-tree engine (spec §8): data-driven, effects are modifiers.
 *
 * A node becomes available when
 * - every node in `requires` is owned (prerequisites, AND), and
 * - if it has neighbours via `links` (undirected), at least one neighbour is owned (path, OR), and
 * - no node of its `exclusive` group in the tree is owned (forks: picking one locks the others out).
 * A tree with `start` gives each leader their start node for free at the beginning of a run.
 */
import { resolveSelf } from './demands';
import { applyBundle } from './effects';
import { instantiate } from './modifiers';
import type { Simulation } from './simulation';
import type { EffectBundle, UpgradeNode, UpgradeTree } from './types';
import { GROUP_IDS } from './types';

export type NodeStatus = 'owned' | 'available' | 'locked' | 'excluded';

interface TreeIndex {
  neighbours: Map<string, string[]>;
  rivals: Map<string, string[]>;
}

const index = new WeakMap<UpgradeTree, TreeIndex>();

function treeIndex(tree: UpgradeTree): TreeIndex {
  let ix = index.get(tree);
  if (ix) return ix;
  const neighbours = new Map<string, string[]>(tree.nodes.map((n) => [n.id, []]));
  const add = (a: string, b: string) => {
    const list = neighbours.get(a);
    if (list && !list.includes(b)) list.push(b);
  };
  for (const n of tree.nodes)
    for (const l of n.links) {
      add(n.id, l);
      add(l, n.id);
    }
  const rivals = new Map<string, string[]>();
  for (const group of tree.exclusive)
    for (const id of group) rivals.set(id, [...(rivals.get(id) ?? []), ...group.filter((x) => x !== id)]);
  ix = { neighbours, rivals };
  index.set(tree, ix);
  return ix;
}

/** Nodes connected to `nodeId` by a link (either direction). */
export function neighboursOf(tree: UpgradeTree, nodeId: string): string[] {
  return treeIndex(tree).neighbours.get(nodeId) ?? [];
}

/** Nodes that buying `nodeId` locks out (its exclusive groups). */
export function rivalsOf(tree: UpgradeTree, nodeId: string): string[] {
  return treeIndex(tree).rivals.get(nodeId) ?? [];
}

/**
 * A link a→b is a fork branch (drawn with a lock) when b belongs to an exclusive group and a is also
 * linked to another node of that group: from a you can take only one of them.
 */
export function isForkLink(tree: UpgradeTree, a: string, b: string): boolean {
  const fromA = neighboursOf(tree, a);
  return rivalsOf(tree, b).some((r) => fromA.includes(r)) || rivalsOf(tree, a).some((r) => neighboursOf(tree, b).includes(r));
}

export function nodeStatus(owned: readonly string[], node: UpgradeNode, tree: UpgradeTree): NodeStatus {
  if (owned.includes(node.id)) return 'owned';
  if (rivalsOf(tree, node.id).some((r) => owned.includes(r))) return 'excluded';
  if (!node.requires.every((r) => owned.includes(r))) return 'locked';
  const nb = neighboursOf(tree, node.id);
  if (nb.length > 0 && !nb.some((x) => owned.includes(x))) return 'locked';
  return 'available';
}

/** Trees the current leader has: shared trees plus their own leader tree. */
export function treesFor(sim: Simulation): UpgradeTree[] {
  return sim.data.upgrades.filter((t) => !t.leader || t.leader === sim.state.leader);
}

export function findNode(sim: Simulation, nodeId: string): { node: UpgradeNode; tree: UpgradeTree } | undefined {
  for (const tree of treesFor(sim)) {
    const node = tree.nodes.find((x) => x.id === nodeId);
    if (node) return { node, tree };
  }
  return undefined;
}

/** Every node the current leader could buy right now, ignoring cost. */
export function availableNodes(sim: Simulation): UpgradeNode[] {
  return treesFor(sim).flatMap((t) => t.nodes.filter((n) => nodeStatus(sim.state.ownedUpgrades, n, t) === 'available'));
}

export function canBuy(sim: Simulation, nodeId: string): string | null {
  const found = findNode(sim, nodeId);
  if (!found) return 'no such node';
  const status = nodeStatus(sim.state.ownedUpgrades, found.node, found.tree);
  if (status === 'owned') return 'already owned';
  if (status === 'excluded') return 'locked out by a fork choice';
  if (status === 'locked') return 'prerequisites missing';
  if (sim.state.pc < found.node.cost) return 'cannot afford';
  return null;
}

function own(sim: Simulation, node: UpgradeNode): void {
  sim.state.ownedUpgrades.push(node.id);
  sim.state.modifiers.push(...instantiate(node.modifiers, `upgrade:${node.id}`));
}

export function buyUpgrade(sim: Simulation, nodeId: string): void {
  const { node } = findNode(sim, nodeId)!;
  sim.state.pc -= node.cost;
  own(sim, node);
  sim.log('upgrade_bought', { nodeId, cost: node.cost });
}

/** Run start: the leader owns their start node of every tree that has one (free, effects apply). */
export function grantStartNodes(sim: Simulation): void {
  for (const tree of treesFor(sim)) {
    const id = tree.start[sim.state.leader];
    const node = id ? tree.nodes.find((n) => n.id === id) : undefined;
    if (node && !sim.state.ownedUpgrades.includes(node.id)) own(sim, node);
  }
}

/** The start node the current leader got in `tree`, if any. */
export function startNodeOf(sim: Simulation, tree: UpgradeTree): string | undefined {
  return tree.start[sim.state.leader];
}

/** Days until an owned active ability can be used again (0 = ready). */
export function upgradeCooldownLeft(sim: Simulation, nodeId: string): number {
  return Math.max(0, (sim.state.upgradeReady[nodeId] ?? 0) - sim.absDay);
}

/** Null if the active ability can be used now on this target, else a reason. */
export function canUseUpgradeAction(sim: Simulation, nodeId: string, target?: string): string | null {
  const found = findNode(sim, nodeId);
  const a = found?.node.active;
  if (!found || !a) return 'no such active ability';
  if (!sim.state.ownedUpgrades.includes(nodeId)) return 'not owned';
  if (sim.state.phase !== 'running') return 'not now';
  if (upgradeCooldownLeft(sim, nodeId) > 0) return 'cooling down';
  if (a.target === 'region' && !sim.data.regions.regions.some((r) => r.code === target)) return 'choose a kraj';
  if (a.target === 'group' && !(GROUP_IDS as readonly string[]).includes(target ?? '')) return 'choose a group';
  if (Math.max(0, -(a.bundle.pc ?? 0)) > sim.state.pc) return 'cannot afford';
  return null;
}

/** The ability's bundle on a target: the kraj for `self`, the chosen group's anger. */
export function upgradeActionBundle(sim: Simulation, nodeId: string, target?: string): EffectBundle {
  const a = findNode(sim, nodeId)!.node.active!;
  let b = a.target === 'region' && target ? resolveSelf(a.bundle, target) : a.bundle;
  if (a.target === 'group' && target && a.groupAnger) b = { ...b, anger: { ...(b.anger ?? {}), [target]: a.groupAnger } };
  return b;
}

export function applyUpgradeAction(sim: Simulation, nodeId: string, target?: string): void {
  const a = findNode(sim, nodeId)!.node.active!;
  const { deltas } = applyBundle(sim, upgradeActionBundle(sim, nodeId, target), 'ability', `upgrade:${nodeId}`, sim.rng.effects);
  sim.state.upgradeReady[nodeId] = sim.absDay + a.cooldownDays;
  sim.log('upgrade_action', { nodeId, target: target ?? null }, deltas);
}
