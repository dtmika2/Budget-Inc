/**
 * Special cards (catastrophes workspace, see CATASTROPHES.md): catastrophes and special agents.
 *
 * A special card is a single, unrefusable card that checks the state at the moment it fires
 * ("Finances >= 40 %?"). A catastrophe applies `onFail` when the check fails; an agent applies `onPass`
 * when it passes. Cards are drawn at each year start (own RNG stream `specials`), announced
 * never announced (surprises; the timeline shows them only once they happened), and resolved in phase
 * 'special': accept (evaluate + apply) -> close.
 */
import { applyBundle } from './effects';
import { regionalSupport } from './election';
import { schedule } from './scheduler';
import type { Simulation } from './simulation';
import type { Deltas, EffectBundle, GroupId, LeaderId, ResourceId, ScheduledEntry } from './types';

export type SpecialKind = 'catastrophe' | 'agent';
export type SpecialOp = 'gte' | 'lte';

export type SpecialCondition =
  | { type: 'resource'; resource: ResourceId; op: SpecialOp; value: number }
  | { type: 'anger'; group: GroupId; op: SpecialOp; value: number }
  | { type: 'pc'; op: SpecialOp; value: number }
  | { type: 'region'; region: string; op: SpecialOp; value: number };

export interface SpecialCardDef {
  id: string;
  kind: SpecialKind;
  title: string;
  text: string;
  condition: SpecialCondition;
  /** Catastrophe: applied when the check fails. */
  onFail?: EffectBundle;
  /** Agent: applied when the check passes. */
  onPass?: EffectBundle;
  weight: number;
  availableFor?: LeaderId[];
  /** Pixel-art scene shown on the card (src/catastrophes/cardArt.tsx); defaults by kind. */
  art?: string;
}

export interface UpcomingSpecial {
  id: string;
  cardId: string;
  fireAbsDay: number;
}

export interface SpecialResult {
  passed: boolean;
  /** The checked value at the moment of accepting. */
  value: number;
  deltas?: Deltas;
}

export interface OpenSpecial {
  id: string;
  cardId: string;
  result: SpecialResult | null;
}

export interface SpecialsState {
  upcoming: UpcomingSpecial[];
  open: OpenSpecial | null;
  seq: number;
}

export const initialSpecials = (): SpecialsState => ({ upcoming: [], open: null, seq: 0 });

const yearDays = (sim: Simulation) => 4 * sim.cfg.time.daysPerQuarter;

function cardsFor(sim: Simulation, kind: SpecialKind): SpecialCardDef[] {
  return sim.data.specialCards.filter((c) => c.kind === kind && (!c.availableFor || c.availableFor.includes(sim.state.leader)));
}

/** At each year-start quarter: draw this year's special cards (kind, day and card). */
export function scheduleYearSpecials(sim: Simulation): void {
  const { cfg, state } = sim;
  const sp = cfg.specials;
  if (!cfg.time.yearStartQuarters.includes(state.quarter)) return;
  const rng = sim.rng.specials;
  const start = sim.absDayOf(state.quarter, 1);
  const lastDay = sim.absDayOf(cfg.time.quarters, cfg.time.daysPerQuarter);
  const from = start + sp.spawnFromDay;
  const to = Math.min(start + yearDays(sim) - sp.spawnBeforeYearEnd, lastDay - 1);
  if (to < from) return;

  const days: number[] = [];
  const usedCards = new Set<string>();
  for (let n = 0; n < sp.perYear; n++) {
    // each card is an agent with agentChance, otherwise a catastrophe (the other kind if one has no cards)
    let kind: SpecialKind = rng.next() < sp.agentChance ? 'agent' : 'catastrophe';
    if (cardsFor(sim, kind).length === 0) kind = kind === 'agent' ? 'catastrophe' : 'agent';
    const pool = cardsFor(sim, kind);
    if (pool.length === 0) continue;
    // a day at least minGapDays from the other cards of this year (a few tries, then give up on this card)
    let day = -1;
    for (let tries = 0; tries < 40 && day < 0; tries++) {
      const d = rng.int(from, to);
      if (days.every((x) => Math.abs(x - d) >= sp.minGapDays)) day = d;
    }
    if (day < 0) continue;
    // prefer a card not drawn yet this year
    const fresh = pool.filter((c) => !usedCards.has(c.id));
    const choices = fresh.length ? fresh : pool;
    const card = choices[rng.weightedIndex(choices.map((c) => c.weight))];
    usedCards.add(card.id);
    days.push(day);
    const id = `sp${state.specials.seq++}`;
    state.specials.upcoming.push({ id, cardId: card.id, fireAbsDay: day });
    schedule(state, 'special', day, { id });
    sim.log('special_scheduled', { id, cardId: card.id, kind, fireAbsDay: day });
  }
}

export function specialCard(sim: Simulation, cardId: string): SpecialCardDef | undefined {
  return sim.data.specialCards.find((c) => c.id === cardId);
}

/** The checked value right now. */
export function conditionValue(sim: Simulation, c: SpecialCondition): number {
  const s = sim.state;
  switch (c.type) {
    case 'resource':
      return s.resources[c.resource];
    case 'anger':
      return s.anger[c.group];
    case 'pc':
      return s.pc;
    case 'region':
      return regionalSupport(sim.data.regions, s.leader, s.resources.support, s.regionShift)[c.region] ?? 0;
  }
}

export function evaluate(sim: Simulation, c: SpecialCondition): { value: number; passed: boolean } {
  const value = conditionValue(sim, c);
  return { value, passed: c.op === 'gte' ? value >= c.value : value <= c.value };
}

/** The bundle the card would apply (onFail for a catastrophe, onPass for an agent). */
export function consequenceOf(card: SpecialCardDef): EffectBundle {
  return (card.kind === 'catastrophe' ? card.onFail : card.onPass) ?? {};
}

/** Fired from the schedule: opens the card (phase 'special', the clock stops). False if it is gone. */
export function openSpecial(sim: Simulation, entry: ScheduledEntry): boolean {
  const { state } = sim;
  const id = String(entry.payload.id);
  const idx = state.specials.upcoming.findIndex((u) => u.id === id);
  if (idx < 0) return false;
  const [u] = state.specials.upcoming.splice(idx, 1);
  const card = specialCard(sim, u.cardId);
  if (!card) return false;
  state.specials.open = { id, cardId: card.id, result: null };
  state.phase = 'special';
  sim.log('special_opened', { id, cardId: card.id, kind: card.kind });
  return true;
}

export function canAcceptSpecial(sim: Simulation): string | null {
  const o = sim.state.specials.open;
  if (sim.state.phase !== 'special' || !o) return 'no special card open';
  return o.result ? 'already accepted' : null;
}

export function canCloseSpecial(sim: Simulation): string | null {
  const o = sim.state.specials.open;
  if (sim.state.phase !== 'special' || !o) return 'no special card open';
  return o.result ? null : 'not accepted yet';
}

/** Accept: evaluate the check now and apply the consequence. The card stays open for the reveal. */
export function acceptSpecial(sim: Simulation): void {
  const open = sim.state.specials.open!;
  const card = specialCard(sim, open.cardId)!;
  const { value, passed } = evaluate(sim, card.condition);
  const applies = card.kind === 'catastrophe' ? !passed : passed;
  let deltas: Deltas | undefined;
  let rolled: Record<string, number> | undefined;
  if (applies) ({ deltas, rolled } = applyBundle(sim, consequenceOf(card), 'special', `special:${card.id}`, sim.rng.effects));
  open.result = { passed, value, deltas };
  sim.log('special_resolved', { id: open.id, cardId: card.id, kind: card.kind, passed, value, threshold: card.condition.value, applied: applies, rolled }, deltas);
}

/** Close the revealed card; the game runs on. */
export function closeSpecial(sim: Simulation): void {
  const open = sim.state.specials.open!;
  sim.state.specials.open = null;
  sim.state.phase = 'running';
  sim.log('special_closed', { id: open.id, cardId: open.cardId });
}

/**
 * Preview page (special.html): open `cardId` right now, replacing a card that is already open. Not used by
 * the game itself; false if the game is in another modal phase or the card does not exist.
 */
export function forceOpenSpecial(sim: Simulation, cardId: string): boolean {
  const { state } = sim;
  if (!specialCard(sim, cardId)) return false;
  if (state.phase === 'special') {
    state.specials.open = null;
    state.phase = 'running';
  }
  if (state.phase !== 'running') return false;
  const id = `preview${state.specials.seq++}`;
  state.specials.upcoming.push({ id, cardId, fireAbsDay: sim.absDay });
  return openSpecial(sim, { seq: -1, kind: 'special', absDay: sim.absDay, payload: { id } });
}

/** Headless bots and tests: accept and close. */
export function resolveSpecialForBot(sim: Simulation): void {
  if (!canAcceptSpecial(sim)) sim.dispatch({ kind: 'acceptSpecial' });
  if (!canCloseSpecial(sim)) sim.dispatch({ kind: 'closeSpecial' });
}
