/**
 * Headless bots for the simulator and tests (spec §13). They act only through dispatch(), so their
 * runs are recorded and replayable like a human's.
 *
 * - random: random picks, random affordable responses, collects each pin with probability 0.5, random
 *   budget option, occasional random reroll / upgrade / ability (to exercise every input kind).
 * - greedy: picks the card / response / budget option with the best expected value after immediate
 *   effects (re-election probability P plus safety terms for resources near 0 and anger near 100), buys
 *   the cheapest available upgrade, collects all pins, uses the ability when it is useful.
 */
import { failBundle, passChance } from './budgetVote';
import type { PreviewRanges } from './effects';
import { Rng } from './rng';
import type { Simulation } from './simulation';
import type { GroupId, Range, ResourceId } from './types';
import { GROUP_IDS, RESOURCE_IDS } from './types';
import { nodeStatus } from './upgrades';

export type BotKind = 'random' | 'greedy' | 'firstCard';

export interface Bot {
  kind: BotKind;
  /** Called before each tick (and whenever a modal phase is open). Makes at most a few dispatches. */
  act(sim: Simulation): void;
}

const mid = (r?: Range) => (r ? (r.min + r.max) / 2 : 0);
const clamp = (v: number) => Math.min(100, Math.max(0, v));

/** Expected value of a state: P plus penalties for danger zones. */
export function stateValue(
  sim: Simulation,
  res: Record<ResourceId, number>,
  anger: Record<GroupId, number>,
  shifts: Record<string, number> = sim.state.regionShift,
): number {
  const P = sim.computeProjection(res.support, anger, shifts).P;
  let v = P;
  const danger = (x: number, lim: number, w: number) => (x < lim ? (lim - x) * w : 0);
  v -= danger(res.coalition, 20, 0.02); // snap election
  v -= danger(res.support, 15, 0.01);
  v -= danger(res.finances, 15, 0.006);
  v -= danger(res.prestige, 10, 0.004);
  for (const g of GROUP_IDS) {
    const lim = g === 'oligarchs' ? 80 : 88;
    if (anger[g] > lim) v -= (anger[g] - lim) * (g === 'oligarchs' ? 0.03 : 0.006);
  }
  return v;
}

/** Value after applying the midpoints of preview ranges (ongoing effects counted at half weight). */
export function valueAfter(sim: Simulation, p: PreviewRanges, scale = 1): number {
  const s = sim.state;
  const res = { ...s.resources };
  const anger = { ...s.anger };
  for (const r of RESOURCE_IDS) res[r] = clamp(res[r] + scale * mid(p.resources[r]));
  for (const g of GROUP_IDS) anger[g] = clamp(anger[g] + scale * mid(p.anger[g]));
  const shifts = { ...s.regionShift };
  for (const [code, r] of Object.entries(p.regions)) shifts[code] = (shifts[code] ?? 0) + scale * mid(r);
  for (const o of p.ongoing) {
    const total = o.perDay * o.days * 0.5 * scale;
    if (o.target.startsWith('anger.')) {
      const g = o.target.slice(6) as GroupId;
      anger[g] = clamp(anger[g] + total);
    } else res[o.target as ResourceId] = clamp(res[o.target as ResourceId] + total);
  }
  return stateValue(sim, res, anger, shifts);
}

function respondAll(sim: Simulation, choose: (instanceId: string, eventId: string) => string): void {
  for (const p of [...sim.state.pendingResponses]) {
    const id = choose(p.instanceId, p.eventId);
    sim.dispatch({ kind: 'respond', eventInstanceId: p.instanceId, responseId: id, timedOut: false });
  }
}

export function createBot(kind: BotKind, seed: string): Bot {
  const rng = new Rng(`${seed}:bot:${kind}`);
  const pinDecided = new Set<string>();

  if (kind === 'firstCard') {
    return {
      kind,
      act(sim) {
        const s = sim.state;
        if (s.phase === 'draft' && s.draft) sim.dispatch({ kind: 'pickPolicy', cardId: s.draft.hand[0] });
        else if (s.phase === 'compromise' && s.compromiseOffer) sim.dispatch({ kind: 'makeCompromise', cardId: s.compromiseOffer[0] });
        else if (s.phase === 'budgetVote') sim.dispatch({ kind: 'voteBudget', optionId: sim.data.budgetVote[0].id });
      },
    };
  }

  if (kind === 'random') {
    let rerolledQuarter = -1;
    return {
      kind,
      act(sim) {
        const s = sim.state;
        if (s.phase === 'draft' && s.draft) {
          if (rerolledQuarter !== s.quarter && rng.next() < 0.15 && s.pc >= sim.currentRerollCost()) {
            rerolledQuarter = s.quarter;
            sim.dispatch({ kind: 'reroll' });
          }
          if (s.phase === 'draft' && s.draft) sim.dispatch({ kind: 'pickPolicy', cardId: rng.pick(s.draft.hand) });
          return;
        }
        if (s.phase === 'budgetVote') {
          sim.dispatch({ kind: 'voteBudget', optionId: rng.pick(sim.data.budgetVote).id });
          return;
        }
        if (s.phase === 'compromise' && s.compromiseOffer) {
          sim.dispatch({ kind: 'makeCompromise', cardId: rng.pick(s.compromiseOffer) });
          return;
        }
        if (s.phase !== 'running') return;
        respondAll(sim, (_inst, eventId) => {
          const opts = sim.eventById.get(eventId)!.responses!.options.filter((o) => o.cost.pc <= sim.state.pc);
          return rng.pick(opts).id;
        });
        for (const pin of [...s.pins]) {
          if (pinDecided.has(pin.id)) continue;
          pinDecided.add(pin.id);
          if (rng.next() < 0.5) sim.dispatch({ kind: 'collectOpportunity', pinId: pin.id });
        }
        if (rng.next() < 0.01) {
          const nodes = sim.data.upgrades.flatMap((t) => t.nodes).filter((n) => nodeStatus(s.ownedUpgrades, n) === 'available' && n.cost <= s.pc);
          if (nodes.length) sim.dispatch({ kind: 'buyUpgrade', nodeId: rng.pick(nodes).id });
        }
        if (s.abilityCharges > 0 && rng.next() < 0.005) sim.dispatch({ kind: 'useAbility' });
      },
    };
  }

  // greedy
  return {
    kind,
    act(sim) {
      const s = sim.state;
      if (s.phase === 'draft' && s.draft) {
        let best = s.draft.hand[0];
        let bestV = -Infinity;
        for (const id of s.draft.hand) {
          const v = valueAfter(sim, sim.previewCard(id));
          if (v > bestV) {
            bestV = v;
            best = id;
          }
        }
        sim.dispatch({ kind: 'pickPolicy', cardId: best });
        return;
      }
      if (s.phase === 'compromise' && s.compromiseOffer) {
        let best = s.compromiseOffer[0];
        let bestV = -Infinity;
        for (const id of s.compromiseOffer) {
          const v = valueAfter(sim, sim.previewCard(id));
          if (v > bestV) {
            bestV = v;
            best = id;
          }
        }
        sim.dispatch({ kind: 'makeCompromise', cardId: best });
        return;
      }
      if (s.phase === 'budgetVote') {
        const failV = valueAfter(sim, sim.preview(failBundle(sim), 'budget_vote'));
        let best = sim.data.budgetVote[0].id;
        let bestV = -Infinity;
        for (const o of sim.data.budgetVote) {
          const p = passChance(sim, o.id);
          const v = p * valueAfter(sim, sim.previewBudgetOption(o.id)) + (1 - p) * failV;
          if (v > bestV) {
            bestV = v;
            best = o.id;
          }
        }
        sim.dispatch({ kind: 'voteBudget', optionId: best });
        return;
      }
      if (s.phase !== 'running') return;
      respondAll(sim, (_inst, eventId) => {
        const opts = sim.eventById.get(eventId)!.responses!.options.filter((o) => o.cost.pc <= sim.state.pc);
        let best = opts[0].id;
        let bestV = -Infinity;
        for (const o of opts) {
          const v = valueAfter(sim, sim.previewResponse(eventId, o.id)) - o.cost.pc * 0.002;
          if (v > bestV) {
            bestV = v;
            best = o.id;
          }
        }
        return best;
      });
      for (const pin of [...s.pins]) sim.dispatch({ kind: 'collectOpportunity', pinId: pin.id });
      // cheapest available upgrade
      const avail = sim.data.upgrades
        .flatMap((t) => t.nodes)
        .filter((n) => nodeStatus(s.ownedUpgrades, n) === 'available')
        .sort((a, b) => a.cost - b.cost);
      if (avail.length && avail[0].cost <= s.pc) sim.dispatch({ kind: 'buyUpgrade', nodeId: avail[0].id });
      // ability when useful
      if (s.abilityCharges > 0) {
        const ability = sim.leaderDef.ability;
        const hasInstant = !!(ability.bundle.effects || ability.bundle.anger);
        if (hasInstant) {
          const gain = valueAfter(sim, sim.previewAbility()) - stateValue(sim, s.resources, s.anger);
          const lastChance = s.quarter % 4 === 0 && s.day > 60;
          if (gain > 0.03 || (lastChance && gain > 0)) sim.dispatch({ kind: 'useAbility' });
        } else {
          // modifier-only ability (Austerity Freeze): time it to cover the budget vote's mandatory growth
          const voteQ = sim.cfg.budgetVote.quarters.includes(s.quarter);
          if (voteQ && s.day >= sim.cfg.budgetVote.day - 20 && s.day < sim.cfg.budgetVote.day) sim.dispatch({ kind: 'useAbility' });
        }
      }
    },
  };
}

export interface RunSummary {
  outcome: string;
  score: number;
  quartersCompleted: number;
  endingId: string | null;
  snap: boolean;
  relaxations: number;
  seats: number | null;
}

/** Drive a simulation to the end with a bot. */
export function runToEnd(sim: Simulation, bot: Bot, maxSteps = 100000): RunSummary {
  for (let i = 0; i < maxSteps && !sim.isOver; i++) {
    bot.act(sim);
    if (sim.isOver) break;
    if (sim.state.phase === 'running') sim.tick();
    else if (sim.state.phase === 'draft' || sim.state.phase === 'budgetVote' || sim.state.phase === 'compromise') {
      // the bot must resolve modal phases; guard against a stuck bot
      bot.act(sim);
      if ((sim.state.phase as string) !== 'running' && !sim.isOver) throw new Error(`Bot ${bot.kind} stuck in phase ${sim.state.phase}`);
    }
  }
  const s = sim.state;
  return {
    outcome: s.outcome ?? 'unfinished',
    score: s.score ?? 0,
    quartersCompleted: s.quartersCompleted,
    endingId: s.endingId,
    snap: !!s.election?.snap,
    relaxations: s.log.filter((e) => e.type === 'pool_relaxed').length,
    seats: s.election?.G ?? null,
  };
}
