import { describe, expect, it } from 'vitest';
import { budgetFailValue, greedyVote, voteValue } from '../src/core/bots';
import { explainMetric, explainStep, metricValue, suggestMoves, summarizeBudget, type MetricKey } from '../src/core/budgetAdvice';
import { presetSliders, shownItems, validateVote, violations, zoneOf } from '../src/core/budgetVote';
import { STREAM_NAMES } from '../src/core/rng';
import type { Simulation } from '../src/core/simulation';
import { quietSim } from './helpers';

/** Open the vote with its drawn hand (as the player sees it). */
function openVote(sim: Simulation): void {
  sim.state.day = 74;
  while (sim.state.phase === 'running') sim.tick();
  expect(sim.state.phase).toBe('budgetVote');
}

const rngStates = (sim: Simulation) => STREAM_NAMES.map((n) => sim.rng[n].getState());
const SEEDS = ['adv-1', 'adv-2', 'adv-3', 'adv-4', 'adv-5'];

describe('budget advice', () => {
  it('is deterministic and never touches the RNG or the state', () => {
    for (const seed of SEEDS) {
      const sim = quietSim({ seed });
      openVote(sim);
      const before = rngStates(sim);
      const state = JSON.stringify(sim.state);
      const s = presetSliders(sim, null);
      const item = shownItems(sim)[0].id;
      const a = [explainStep(sim, s, null, item, 2), suggestMoves(sim, s, null), summarizeBudget(sim, s, null), explainMetric(sim, s, null, { kind: 'resource', id: 'finances' })];
      const b = [explainStep(sim, s, null, item, 2), suggestMoves(sim, s, null), summarizeBudget(sim, s, null), explainMetric(sim, s, null, { kind: 'resource', id: 'finances' })];
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(rngStates(sim)).toEqual(before);
      expect(JSON.stringify(sim.state)).toBe(state);
    }
  });

  it('suggestions are valid votes, better than the inspected setting, and cross no new red line', () => {
    for (const seed of SEEDS) {
      const sim = quietSim({ seed });
      openVote(sim);
      const items = shownItems(sim);
      const current = presetSliders(sim, null);
      // inspect a deep cut of the first item (often a red line / cut zone) and the current setting
      const target = { ...current, [items[0].id]: -3 };
      const failV = budgetFailValue(sim);
      for (const [t, cur] of [
        [target, { sliders: current, presetId: null }],
        [current, undefined],
      ] as const) {
        const baseV = voteValue(sim, t, null, failV);
        const sug = suggestMoves(sim, t, null, cur);
        expect(sug.length).toBeLessThanOrEqual(sim.cfg.budgetAdvice.maxSuggestions);
        for (const s of sug) {
          expect(validateVote(sim, s.sliders, s.presetId)).toBeNull();
          expect(violations(sim, s.sliders).length).toBeLessThanOrEqual(violations(sim, t).length);
          expect(voteValue(sim, s.sliders, s.presetId, failV)).toBeGreaterThan(baseV);
          expect(s.gain).toBeCloseTo(voteValue(sim, s.sliders, s.presetId, failV) - baseV, 9);
        }
        for (let i = 1; i < sug.length; i++) expect(sug[i - 1].gain).toBeGreaterThanOrEqual(sug[i].gain);
        const stepItems = sug.filter((s) => s.item).map((s) => s.item);
        expect(new Set(stepItems).size).toBe(stepItems.length);
      }
    }
  });

  it('explainStep reports zone changes and the pass-chance change of the previews', () => {
    const sim = quietSim({ seed: 'adv-zone' });
    openVote(sim);
    const s = presetSliders(sim, null);
    for (const it of shownItems(sim)) {
      for (const to of [-3, -2, 2, 3]) {
        const a = explainStep(sim, s, null, it.id, to);
        expect(a.after.passChance).toBeCloseTo(sim.previewVote({ ...s, [it.id]: to }, null).passChance, 12);
        const zone = zoneOf(it, to);
        const enter = a.reasons.find((r) => r.kind === 'zoneEnter');
        if (zone === 'safe') expect(enter).toBeUndefined();
        else expect(enter).toEqual({ kind: 'zoneEnter', item: it.id, zone });
        const pass = a.reasons.find((r) => r.kind === 'pass');
        const dp = a.after.passChance - a.before.passChance;
        if (Math.abs(dp) >= sim.cfg.budgetAdvice.minPassDelta) expect(pass).toEqual({ kind: 'pass', delta: dp });
        else expect(pass).toBeUndefined();
      }
    }
  });

  it('explainMetric parts plus the rest add up to the previewed total', () => {
    const sim = quietSim({ seed: 'adv-metric' });
    openVote(sim);
    const items = shownItems(sim);
    const s = { ...presetSliders(sim, null), [items[0].id]: 2, [items[1].id]: -2, [items[2].id]: 1 };
    const p = sim.previewVote(s, null);
    const keys: MetricKey[] = [
      { kind: 'resource', id: 'finances' },
      { kind: 'resource', id: 'support' },
      { kind: 'group', id: 'pensioners' },
      ...Object.keys(p.regions).slice(0, 3).map((id) => ({ kind: 'kraj', id }) as MetricKey),
    ];
    for (const m of keys) {
      const e = explainMetric(sim, s, null, m);
      expect(e.total).toBeCloseTo(metricValue(p, m), 9);
      expect(e.parts.reduce((x, q) => x + q.delta, 0) + e.rest).toBeCloseTo(e.total, 9);
      if (e.tip) expect(violations(sim, { ...s, [e.tip.item]: (s[e.tip.item] ?? 0) + e.tip.dir }).length).toBeLessThanOrEqual(violations(sim, s).length);
    }
  });

  it('the greedy bot vote is unchanged by sharing its scoring with the advice', () => {
    const out = SEEDS.map((seed) => {
      const sim = quietSim({ seed });
      openVote(sim);
      return greedyVote(sim);
    });
    expect(out).toMatchSnapshot();
  });
});
