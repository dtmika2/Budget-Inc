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
import { canUseAbility, condemnTargets, type CondemnTarget } from './abilities';
import { canRerollBudget, failBundle, presetSliders, sameSliders, shownItems, type Sliders } from './budgetVote';
import { channelBlocked } from './compromise';
import { budgetConditionMet, pledgesForCard, pledgesForCompromise, templateOf } from './demands';
import type { PreviewRanges } from './effects';
import { canAnswerRegionEvent } from './regionEvents';
import { canDoRegionAction, offeredActions, regionActionPcCost } from './regionActions';
import { Rng } from './rng';
import type { Simulation } from './simulation';
import type { GroupId, Range, ResourceId } from './types';
import { GROUP_IDS, RESOURCE_IDS } from './types';
import { availableNodes, canUseUpgradeAction, treesFor } from './upgrades';
import { resolveSpecialForBot } from './specialCards';

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

/** Value change of applying a preview, relative to now. */
function gain(sim: Simulation, p: PreviewRanges): number {
  return valueAfter(sim, p) - stateValue(sim, sim.state.resources, sim.state.anger);
}

/** Value of fulfilling these pledges (their onFulfil minus the onFail they avoid). */
function pledgeBonus(sim: Simulation, pledges: { templateId: string; region: string }[]): number {
  let v = 0;
  for (const p of pledges) {
    const pr = sim.previewDemand(p.templateId, p.region);
    v += gain(sim, pr.fulfil) - gain(sim, pr.fail);
  }
  return v;
}

/** Best use of an owned active skill-tree ability now, or null when none helps (P29). Prices like kraj actions. */
export function greedyUpgradeAction(sim: Simulation): { nodeId: string; target?: string } | null {
  const now = stateValue(sim, sim.state.resources, sim.state.anger);
  let best: { nodeId: string; target?: string } | null = null;
  let bestV = 0;
  for (const n of treesFor(sim).flatMap((tr) => tr.nodes)) {
    const a = n.active;
    if (!a || !sim.state.ownedUpgrades.includes(n.id)) continue;
    const targets: (string | undefined)[] = a.target === 'region' ? sim.data.regions.regions.map((r) => r.code) : a.target === 'group' ? [...GROUP_IDS] : [undefined];
    for (const target of targets) {
      if (canUseUpgradeAction(sim, n.id, target)) continue;
      const p = sim.previewUpgradeAction(n.id, target);
      const fin = -mid(p.resources.finances);
      if (fin > 0 && sim.state.resources.finances - fin < sim.cfg.bots.regionActionFinanceReserve) continue;
      const pcCost = Math.max(0, -(a.bundle.pc ?? 0));
      const v = valueAfter(sim, p) - now - pcCost * sim.cfg.bots.regionActionPcPrice - Math.max(0, fin) * sim.cfg.bots.regionActionFinancePrice;
      if (v > bestV) {
        bestV = v;
        best = { nodeId: n.id, target };
      }
    }
  }
  return best;
}

/** Best kraj action now (value gain minus a small PC price), or null when none helps (P26). */
export function greedyRegionAction(sim: Simulation): { region: string; actionId: string } | null {
  const now = stateValue(sim, sim.state.resources, sim.state.anger);
  let best: { region: string; actionId: string } | null = null;
  let bestV = 0;
  for (const r of sim.data.regions.regions) {
    for (const a of offeredActions(sim, r.code)) {
      if (canDoRegionAction(sim, r.code, a.id)) continue;
      const p = sim.previewRegionAction(a.id, r.code);
      const fin = -mid(p.resources.finances);
      if (fin > 0 && sim.state.resources.finances - fin < sim.cfg.bots.regionActionFinanceReserve) continue;
      const v = valueAfter(sim, p) - now - regionActionPcCost(a) * sim.cfg.bots.regionActionPcPrice - Math.max(0, fin) * sim.cfg.bots.regionActionFinancePrice;
      if (v > bestV) {
        bestV = v;
        best = { region: r.code, actionId: a.id };
      }
    }
  }
  return best;
}

/** Greedy answer to a demand: accept when its expected value beats rejecting. */
export function greedyAccepts(sim: Simulation, templateId: string, region: string): boolean {
  const pr = sim.previewDemand(templateId, region);
  const q = sim.cfg.bots.pledgeFulfilEstimate;
  const accept = gain(sim, pr.accept) + q * gain(sim, pr.fulfil) + (1 - q) * gain(sim, pr.fail);
  return accept > gain(sim, pr.reject);
}

/** Greedy answer to a region event: intervene when it is affordable and beats ignoring. */
export function greedyIntervenes(sim: Simulation, eventId: string): boolean {
  if (canAnswerRegionEvent(sim, eventId, true)) return false;
  const ev = sim.state.regionEvents.find((e) => e.id === eventId)!;
  const pr = sim.previewRegionEvent(ev.templateId, ev.region);
  return gain(sim, pr.intervene) > gain(sim, pr.ignore);
}

/** Greedy use of the once-per-game abilities: a simple trigger per ability, anything left in the last year. */
export function greedyAbility(sim: Simulation): { kind: 'useAbility'; abilityId: string; target?: string } | null {
  const s = sim.state;
  const unused = sim.leaderDef.abilities.filter((a) => !s.abilitiesUsed.includes(a.id));
  if (!unused.length) return null;
  const lastYear = s.quarter >= sim.cfg.time.quarters - 3;
  const angriest = [...GROUP_IDS].sort((a, b) => s.anger[b] - s.anger[a])[0];
  for (const a of unused) {
    const tryUse = (target?: string) => (canUseAbility(sim, a.id, target) ? null : { kind: 'useAbility' as const, abilityId: a.id, target });
    if (a.action === 'halveAnger') {
      if (s.anger[angriest] >= 60 || lastYear) return tryUse(angriest);
      continue;
    }
    if (a.action === 'cancelEvent') {
      // the open item whose default outcome hurts most
      const worst = condemnTargets(sim)
        .map((c) => ({ c, v: condemnValue(sim, c) }))
        .sort((x, y) => x.v - y.v)[0];
      if (worst && (worst.v < -0.02 || lastYear)) return tryUse(worst.c.target);
      continue;
    }
    // year-long effects pay off most when used early; the rest wait for their moment
    const early = s.quarter >= 2;
    const trigger =
      (a.id === 'press_release' && (s.anger.media >= 40 || early)) ||
      (a.id === 'godfathers' && (s.anger.oligarchs >= 40 || early)) ||
      (a.id === 'microbossing' && s.resources.coalition < 45) ||
      (a.id === 'subsidies' && s.resources.finances >= 55);
    if (trigger || lastYear) return tryUse();
  }
  return null;
}

/** Value change if an open item ran its default course (what condemning it saves, negative = it hurts). */
function condemnValue(sim: Simulation, c: CondemnTarget): number {
  const s = sim.state;
  const now = stateValue(sim, s.resources, s.anger);
  if (c.kind === 'regionEvent') return valueAfter(sim, sim.previewRegionEvent(c.ref, c.region!).ignore) - now;
  if (c.kind === 'demand') return valueAfter(sim, sim.previewDemand(c.ref, c.region!).ignore) - now;
  if (c.kind === 'response') {
    const ev = sim.eventById.get(c.ref);
    return ev?.responses ? valueAfter(sim, sim.previewResponse(ev.id, ev.responses.default)) - now : 0;
  }
  return -0.01;
}

/** Compromise channels usable right now (config order). */
export function availableChannels(sim: Simulation): string[] {
  return Object.keys(sim.cfg.compromise.channels).filter((id) => !channelBlocked(sim, id));
}

/** Vote input for a preset as-is. */
export function presetVote(sim: Simulation, presetId: string): { kind: 'voteBudget'; sliders: Sliders; presetId: string } {
  return { kind: 'voteBudget', sliders: presetSliders(sim, presetId), presetId };
}

/** Expected value of a slider setting: pass chance x value after + fail chance x value after failing. */
export function voteValue(sim: Simulation, sliders: Sliders, presetId: string | null, failV: number): number {
  const p = sim.previewVote(sliders, presetId);
  const kept = sim.state.pledges.filter((pl) =>
    templateOf(sim, pl.templateId).fulfil.some((c) => c.type === 'budget' && budgetConditionMet(c, sliders)),
  );
  return p.passChance * (valueAfter(sim, p) + pledgeBonus(sim, kept)) + (1 - p.passChance) * failV;
}

/** Greedy vote: best preset, then a bounded deterministic hill-climb over the sliders. */
/** Value after a failed vote (the baseline of voteValue). */
export const budgetFailValue = (sim: Simulation) => valueAfter(sim, sim.preview(failBundle(sim), 'budget_vote'));

export function greedyVote(sim: Simulation, maxPasses = 2): { kind: 'voteBudget'; sliders: Sliders; presetId: string | null } {
  const failV = budgetFailValue(sim);
  let presetId: string | null = sim.data.budgetVote[0].id;
  let bestV = -Infinity;
  for (const o of sim.data.budgetVote) {
    const v = voteValue(sim, presetSliders(sim, o.id), o.id, failV);
    if (v > bestV) {
      bestV = v;
      presetId = o.id;
    }
  }
  const base = presetSliders(sim, presetId);
  let sliders = { ...base };
  const { minSteps, maxSteps } = sim.cfg.budgetVote.sliders;
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (const it of shownItems(sim)) {
      for (const d of [-1, 1]) {
        const next = sliders[it.id] + d;
        if (next < minSteps || next > maxSteps) continue;
        const cand = { ...sliders, [it.id]: next };
        const pid = sameSliders(sim, cand, base) ? presetId : null;
        const v = voteValue(sim, cand, pid, failV);
        if (v > bestV + 1e-9) {
          bestV = v;
          sliders = cand;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { kind: 'voteBudget', sliders, presetId: sameSliders(sim, sliders, base) ? presetId : null };
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
        else if (s.phase === 'compromise' && s.compromiseOffer) sim.dispatch({ kind: 'makeCompromise', cardId: s.compromiseOffer[0], channelId: 'press', score: 0.5 });
        else if (s.phase === 'budgetVote') sim.dispatch(presetVote(sim, sim.data.budgetVote[0].id));
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
          if (rng.next() < 0.2 && !canRerollBudget(sim)) sim.dispatch({ kind: 'rerollBudget' });
          const preset = rng.pick(sim.data.budgetVote).id;
          const sliders = presetSliders(sim, preset);
          const { minSteps, maxSteps } = sim.cfg.budgetVote.sliders;
          const nudges = rng.int(0, 3);
          for (let i = 0; i < nudges; i++) {
            const id = rng.pick(shownItems(sim)).id;
            sliders[id] = Math.min(maxSteps, Math.max(minSteps, sliders[id] + (rng.next() < 0.5 ? -1 : 1)));
          }
          sim.dispatch({ kind: 'voteBudget', sliders, presetId: sameSliders(sim, sliders, presetSliders(sim, preset)) ? preset : null });
          return;
        }
        if (s.phase === 'compromise' && s.compromiseOffer) {
          const channels = availableChannels(sim);
          sim.dispatch({ kind: 'makeCompromise', cardId: rng.pick(s.compromiseOffer), channelId: rng.pick(channels), score: Math.round(rng.next() * 100) / 100 });
          return;
        }
        if (s.phase !== 'running') return;
        respondAll(sim, (_inst, eventId) => {
          const opts = sim.eventById.get(eventId)!.responses!.options.filter((o) => o.cost.pc <= sim.state.pc);
          return rng.pick(opts).id;
        });
        for (const d of [...s.demands]) sim.dispatch({ kind: rng.next() < 0.5 ? 'acceptDemand' : 'rejectDemand', demandId: d.id });
        for (const e of [...s.regionEvents]) {
          const intervene = rng.next() < 0.5 && !canAnswerRegionEvent(sim, e.id, true);
          sim.dispatch({ kind: intervene ? 'interveneRegionEvent' : 'ignoreRegionEvent', eventId: e.id });
        }
        for (const pin of [...s.pins]) {
          if (pinDecided.has(pin.id)) continue;
          pinDecided.add(pin.id);
          if (rng.next() < 0.5) sim.dispatch({ kind: 'collectOpportunity', pinId: pin.id });
        }
        if (rng.next() < 0.02) {
          const region = rng.pick(sim.data.regions.regions).code;
          const acts = offeredActions(sim, region);
          if (acts.length) sim.dispatch({ kind: 'regionAction', region, actionId: rng.pick(acts).id });
        }
        if (rng.next() < 0.02) {
          const acts = treesFor(sim).flatMap((tr) => tr.nodes).filter((n) => n.active && s.ownedUpgrades.includes(n.id));
          if (acts.length) {
            const n = rng.pick(acts);
            const target = n.active!.target === 'region' ? rng.pick(sim.data.regions.regions).code : n.active!.target === 'group' ? rng.pick([...GROUP_IDS]) : undefined;
            sim.dispatch({ kind: 'useUpgradeAction', nodeId: n.id, target });
          }
        }
        if (rng.next() < 0.01) {
          const nodes = availableNodes(sim).filter((n) => n.cost <= s.pc);
          if (nodes.length) sim.dispatch({ kind: 'buyUpgrade', nodeId: rng.pick(nodes).id });
        }
        if (rng.next() < 0.005) {
          const unused = sim.leaderDef.abilities.filter((a) => !s.abilitiesUsed.includes(a.id));
          if (unused.length) {
            const a = rng.pick(unused);
            const targets = a.action === 'cancelEvent' ? condemnTargets(sim).map((c) => c.target) : a.action === 'halveAnger' ? [...GROUP_IDS] : [undefined];
            if (targets.length) sim.dispatch({ kind: 'useAbility', abilityId: a.id, target: rng.pick(targets) });
          }
        }
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
          const v = valueAfter(sim, sim.previewCard(id)) + pledgeBonus(sim, pledgesForCard(sim, id));
          if (v > bestV) {
            bestV = v;
            best = id;
          }
        }
        sim.dispatch({ kind: 'pickPolicy', cardId: best });
        return;
      }
      if (s.phase === 'compromise' && s.compromiseOffer) {
        const score = sim.cfg.bots.greedyMinigameScore;
        let best = { cardId: s.compromiseOffer[0], channelId: 'press' };
        let bestV = -Infinity;
        for (const id of s.compromiseOffer) {
          for (const ch of availableChannels(sim)) {
            const v = valueAfter(sim, sim.previewCompromise(id, ch, score)) + pledgeBonus(sim, pledgesForCompromise(sim, id));
            if (v > bestV) {
              bestV = v;
              best = { cardId: id, channelId: ch };
            }
          }
        }
        sim.dispatch({ kind: 'makeCompromise', ...best, score });
        return;
      }
      if (s.phase === 'budgetVote') {
        sim.dispatch(greedyVote(sim));
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
      for (const d of [...s.demands])
        sim.dispatch({ kind: greedyAccepts(sim, d.templateId, d.region) ? 'acceptDemand' : 'rejectDemand', demandId: d.id });
      for (const e of [...s.regionEvents]) sim.dispatch({ kind: greedyIntervenes(sim, e.id) ? 'interveneRegionEvent' : 'ignoreRegionEvent', eventId: e.id });
      // kraj actions (P26): the best one when it adds value, checked once a week
      if (sim.absDay % 7 === 0) {
        const best = greedyRegionAction(sim);
        if (best) sim.dispatch({ kind: 'regionAction', ...best });
      }
      // active skill-tree abilities (P29): the best use when it adds value, checked once a week
      if (sim.absDay % 7 === 3) {
        const best = greedyUpgradeAction(sim);
        if (best) sim.dispatch({ kind: 'useUpgradeAction', ...best });
      }
      // cheapest available upgrade
      const avail = availableNodes(sim).sort((a, b) => a.cost - b.cost);
      if (avail.length && avail[0].cost <= s.pc) sim.dispatch({ kind: 'buyUpgrade', nodeId: avail[0].id });
      // abilities: each once, by a simple rule
      const input = greedyAbility(sim);
      if (input) sim.dispatch(input);
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
    if (sim.state.phase === 'special') {
      resolveSpecialForBot(sim);
      continue;
    }
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
