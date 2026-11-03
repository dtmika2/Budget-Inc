import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { createBot, runToEnd } from '../src/core/bots';
import { evaluate, specialCard, visibleWarnings, type SpecialCardDef, type SpecialCondition } from '../src/core/specialCards';
import { schedule } from '../src/core/scheduler';
import type { Simulation } from '../src/core/simulation';
import { loadGameData } from '../src/data/loader';
import { readDataFiles, readLocale } from '../scripts/lib/nodeData';
import { fullGameData, makeSim, resolveModal } from './helpers';

const FILE = 'data/catastrophes/dummy.json';

/** A sim with special cards, past the first draft, with nothing else scheduled. */
function sim(seed = 'specials') {
  const s = makeSim({ seed }, config, fullGameData());
  resolveModal(s);
  return s;
}

/** Fire `cardId` today: put it in the upcoming list, schedule it and tick into it. */
function fire(s: Simulation, cardId: string) {
  s.state.schedule = [];
  s.state.specials.upcoming = [{ id: 'test', cardId, fireAbsDay: s.absDay }];
  schedule(s.state, 'special', s.absDay, { id: 'test' });
  s.tick();
  expect(s.state.phase).toBe('special');
}

function card(s: Simulation, id: string): SpecialCardDef {
  return specialCard(s, id)!;
}

describe('special cards: scheduling', () => {
  it('draws the configured catastrophes and agents for the year, spaced and inside the window', () => {
    const s = makeSim({ seed: 'year' }, config, fullGameData());
    const sp = config.specials;
    const up = s.state.specials.upcoming;
    const kinds = up.map((u) => card(s, u.cardId).kind);
    expect(kinds.filter((k) => k === 'catastrophe')).toHaveLength(sp.catastrophesPerYear);
    expect(kinds.filter((k) => k === 'agent')).toHaveLength(sp.agentsPerYear);
    const days = up.map((u) => u.fireAbsDay).sort((a, b) => a - b);
    for (const d of days) {
      expect(d).toBeGreaterThanOrEqual(1 + sp.spawnFromDay);
      expect(d).toBeLessThanOrEqual(4 * config.time.daysPerQuarter - sp.spawnBeforeYearEnd + 1);
    }
    for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBeGreaterThanOrEqual(sp.minGapDays);
    expect(s.state.schedule.filter((e) => e.kind === 'special')).toHaveLength(up.length);
  });

  it('is deterministic per seed', () => {
    const a = makeSim({ seed: 'same' }, config, fullGameData());
    const b = makeSim({ seed: 'same' }, config, fullGameData());
    expect(a.state.specials.upcoming).toEqual(b.state.specials.upcoming);
  });

  it('shows a warning only within warnDays before the card fires', () => {
    const s = sim();
    s.state.specials.upcoming = [{ id: 'w', cardId: 'dummy_cat_finances', fireAbsDay: s.absDay + config.specials.warnDays + 1 }];
    expect(visibleWarnings(s)).toHaveLength(0);
    s.state.specials.upcoming[0].fireAbsDay = s.absDay + config.specials.warnDays;
    expect(visibleWarnings(s).map((w) => w.daysLeft)).toEqual([config.specials.warnDays]);
  });
});

describe('special cards: checks', () => {
  it('each condition type passes and fails at its threshold', () => {
    const s = sim();
    const at = (c: SpecialCondition, set: (v: number) => void) => {
      set(c.value);
      expect(evaluate(s, c).passed).toBe(true);
      set(c.op === 'gte' ? c.value - 1 : c.value + 1);
      expect(evaluate(s, c).passed).toBe(false);
    };
    at({ type: 'resource', resource: 'finances', op: 'gte', value: 40 }, (v) => (s.state.resources.finances = v));
    at({ type: 'anger', group: 'media', op: 'lte', value: 60 }, (v) => (s.state.anger.media = v));
    at({ type: 'pc', op: 'gte', value: 3 }, (v) => (s.state.pc = v));
    const region = { type: 'region' as const, region: 'CZ080', op: 'gte' as const, value: 35 };
    const offset = evaluate(s, region).value - s.state.resources.support;
    at(region, (v) => (s.state.resources.support = v - offset));
  });
});

describe('special cards: resolution', () => {
  it('a failed catastrophe applies its sanction, a passed one does nothing', () => {
    const s = sim();
    fire(s, 'dummy_cat_finances');
    s.state.resources.finances = 10;
    const support = s.state.resources.support;
    expect(s.dispatch({ kind: 'acceptSpecial' }).ok).toBe(true);
    expect(s.state.specials.open!.result!.passed).toBe(false);
    expect(s.state.resources.support).toBeLessThan(support);
    expect(s.state.phase).toBe('special');
    expect(s.dispatch({ kind: 'closeSpecial' }).ok).toBe(true);
    expect(s.state.phase).toBe('running');

    fire(s, 'dummy_cat_finances');
    s.state.resources.finances = 90;
    const before = { ...s.state.resources };
    s.dispatch({ kind: 'acceptSpecial' });
    expect(s.state.specials.open!.result!.passed).toBe(true);
    expect(s.state.resources.support).toBe(before.support);
    expect(s.state.resources.coalition).toBe(before.coalition);
  });

  it('a passed agent gives its bonus, a failed one does nothing', () => {
    const s = sim();
    fire(s, 'dummy_agent_pc');
    s.state.pc = 5;
    const prestige = s.state.resources.prestige;
    s.dispatch({ kind: 'acceptSpecial' });
    expect(s.state.specials.open!.result!.passed).toBe(true);
    expect(s.state.resources.prestige).toBeGreaterThan(prestige);
    s.dispatch({ kind: 'closeSpecial' });

    fire(s, 'dummy_agent_pc');
    s.state.pc = 0;
    const p0 = s.state.resources.prestige;
    s.dispatch({ kind: 'acceptSpecial' });
    expect(s.state.specials.open!.result!.passed).toBe(false);
    expect(s.state.resources.prestige).toBe(p0);
  });

  it('the clock stops while a card is open and inputs come in order', () => {
    const s = sim();
    fire(s, 'dummy_cat_media');
    const day = s.absDay;
    s.tick();
    expect(s.absDay).toBe(day);
    expect(s.dispatch({ kind: 'closeSpecial' }).ok).toBe(false);
    expect(s.dispatch({ kind: 'acceptSpecial' }).ok).toBe(true);
    expect(s.dispatch({ kind: 'acceptSpecial' }).ok).toBe(false);
    expect(s.dispatch({ kind: 'closeSpecial' }).ok).toBe(true);
    expect(s.dispatch({ kind: 'closeSpecial' }).ok).toBe(false);
    expect(s.state.log.map((e) => e.type)).toEqual(expect.arrayContaining(['special_opened', 'special_resolved', 'special_closed']));
  });

  it('bots play through a whole run with special cards', () => {
    for (const leader of ['mupka', 'abis']) {
      const s = makeSim({ seed: `bot-${leader}`, leader }, config, fullGameData());
      const summary = runToEnd(s, createBot('greedy', `bot-${leader}`));
      expect(summary.outcome).not.toBe('unfinished');
      expect(s.state.log.some((e) => e.type === 'special_resolved')).toBe(true);
    }
  });
});

describe('special cards: data', () => {
  const codes = (patch: (cards: Record<string, unknown>[]) => void) => {
    const files = readDataFiles();
    const cards = structuredClone(files[FILE]) as Record<string, unknown>[];
    patch(cards);
    const r = loadGameData({ ...files, [FILE]: cards }, readLocale());
    return r.ok ? [] : r.errors.map((e) => e.code);
  };

  it('loads cleanly', () => {
    expect(codes(() => {})).toEqual([]);
  });

  it('rejects a bad region, a bad group, a missing consequence and a missing text', () => {
    expect(codes((c) => ((c[2].condition as Record<string, unknown>).region = 'CZ999'))).toContain('unknownRegion');
    expect(codes((c) => ((c[1].condition as Record<string, unknown>).group = 'nope'))).toContain('schema');
    expect(codes((c) => delete c[0].onFail)).toContain('schema');
    expect(codes((c) => (c[3].onFail = c[3].onPass))).toContain('schema');
    expect(codes((c) => (c[0].title = 'special.nope'))).toContain('missingLocale');
  });
});
