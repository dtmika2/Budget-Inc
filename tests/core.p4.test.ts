import { describe, expect, it } from 'vitest';
import { presetVote } from '../src/core/bots';
import { config } from '../src/config';
import { scheduleChaosForPick } from '../src/core/chaos';
import { registerOngoing } from '../src/core/effects';
import { passChance, presetSliders } from '../src/core/budgetVote';
import { nodeStatus } from '../src/core/upgrades';
import { advanceQuiet, cfgWith, gameData, makeSim, quietSim } from './helpers';

const cardById = (id: string) => gameData().policies.find((c) => c.id === id)!;

describe('chaos events', () => {
  it('fire at the expected rate (chance x difficulty multiplier) over many seeds', () => {
    for (const [difficulty, mult] of [
      ['normal', 1],
      ['hard', 1.2],
    ] as const) {
      let fired = 0;
      const N = 1500;
      for (let i = 0; i < N; i++) {
        const sim = makeSim({ seed: `chaos-${i}`, difficulty });
        sim.state.schedule = [];
        scheduleChaosForPick(sim, cardById('dummy_revenue')); // dummy_evt_1, chance 0.4
        if (sim.state.schedule.some((e) => e.kind === 'chaos')) fired++;
      }
      expect(Math.abs(fired / N - 0.4 * mult)).toBeLessThan(0.04);
    }
  });

  it('is scheduled inside its window and quarter offset, then fires and applies effects', () => {
    const sim = makeSim({ seed: 'fire' });
    sim.state.schedule = sim.state.schedule.filter((e) => e.kind === 'budgetVote');
    const data = { ...gameData(), events: gameData().events.map((e) => ({ ...e, chance: 1 })) };
    const s2 = makeSim({ seed: 'fire' }, config, data);
    s2.state.schedule = [];
    scheduleChaosForPick(s2, cardById('dummy_expenditure')); // dummy_evt_3: offset 1, window 5–60
    const e = s2.state.schedule.find((x) => x.kind === 'chaos')!;
    const q = Math.ceil(e.absDay / 91);
    const d = e.absDay - (q - 1) * 91;
    expect(q).toBe(2);
    expect(d).toBeGreaterThanOrEqual(5);
    expect(d).toBeLessThanOrEqual(60);
    // fire it
    s2.dispatch({ kind: 'pickPolicy', cardId: s2.state.draft!.hand[0] });
    s2.state.schedule = s2.state.schedule.filter((x) => x === e);
    s2.state.resources.coalition = 100;
    while (!s2.state.log.some((l) => l.type === 'chaos_fired' && l.eventId === 'dummy_evt_3') && !s2.isOver) {
      if (s2.state.phase === 'draft') s2.dispatch({ kind: 'pickPolicy', cardId: s2.state.draft!.hand[0] });
      else if (s2.state.phase === 'compromise') s2.dispatch({ kind: 'makeCompromise', cardId: s2.state.compromiseOffer![0], channelId: 'press', score: 0.5 });
      else s2.tick();
    }
    const fired = s2.state.log.find((l) => l.type === 'chaos_fired' && l.eventId === 'dummy_evt_3')!;
    expect(fired.absDay).toBe(e.absDay);
    expect(fired.deltas!.resources.coalition).toBeLessThan(0);
  });

  it('logs chaos_scheduled with notFired when the roll fails', () => {
    const data = { ...gameData(), events: gameData().events.map((e) => ({ ...e, chance: 0 })) };
    const sim = makeSim({ seed: 'nf' }, config, data);
    sim.dispatch({ kind: 'pickPolicy', cardId: sim.state.draft!.hand[0] });
    const entry = sim.state.log.find((l) => l.type === 'chaos_scheduled')!;
    expect(entry.notFired).toBe(true);
  });

  it('events scheduled beyond the term are cancelled and logged at the end', () => {
    const sim = quietSim();
    sim.state.schedule.push({ seq: 999, kind: 'chaos', absDay: 99999, payload: { eventId: 'dummy_evt_1' } });
    sim.state.resources.coalition = 0;
    sim.tick();
    expect(sim.state.phase).toBe('election');
    expect(sim.state.log.some((l) => l.type === 'scheduled_cancelled' && l.what === 'chaos' && l.reason === 'snap_election')).toBe(true);
  });
});

function firedRespondable() {
  const data = { ...gameData(), events: gameData().events.map((e) => ({ ...e, chance: 1 })) };
  const sim = makeSim({ seed: 'resp' }, config, data);
  sim.state.schedule = [];
  sim.dispatch({ kind: 'pickPolicy', cardId: sim.state.draft!.hand[0] });
  sim.state.schedule = [{ seq: 1000, kind: 'chaos', absDay: sim.absDay, payload: { eventId: 'dummy_evt_2' } }];
  sim.tick();
  return sim;
}

describe('respondable events', () => {
  it('creates a pending response and applies the default on timeout', () => {
    const sim = firedRespondable();
    expect(sim.state.pendingResponses).toHaveLength(1);
    const p = sim.state.pendingResponses[0];
    expect(sim.dispatch({ kind: 'respond', eventInstanceId: p.instanceId, responseId: 'deny', timedOut: true }).ok).toBe(true);
    const log = sim.state.log.find((l) => l.type === 'event_response')!;
    expect(log.responseId).toBe('ignore'); // default wins on timeout
    expect(log.timedOut).toBe(true);
    expect(sim.state.pendingResponses).toHaveLength(0);
  });

  it('rejects unaffordable responses and charges PC for affordable ones', () => {
    const sim = firedRespondable();
    const p = sim.state.pendingResponses[0];
    sim.state.pc = 0;
    expect(sim.dispatch({ kind: 'respond', eventInstanceId: p.instanceId, responseId: 'apologise', timedOut: false }).ok).toBe(false);
    sim.state.pc = 3;
    const c0 = sim.state.resources.coalition;
    expect(sim.dispatch({ kind: 'respond', eventInstanceId: p.instanceId, responseId: 'apologise', timedOut: false }).ok).toBe(true);
    expect(sim.state.pc).toBe(2);
    expect(sim.state.resources.coalition).toBeLessThan(c0);
  });

  it('response ranges are previewed after modifiers', () => {
    const sim = firedRespondable();
    const before = sim.previewResponse('dummy_evt_2', 'deny').anger.media!;
    sim.state.ownedUpgrades.push('sup_campaign_office');
    sim.state.pc = 10;
    sim.dispatch({ kind: 'buyUpgrade', nodeId: 'sup_press_office' });
    const after = sim.previewResponse('dummy_evt_2', 'deny').anger.media!;
    expect(after.max).toBeCloseTo(before.max * 0.75);
  });
});

describe('opportunity pins', () => {
  it('spawns perQuarter pins per quarter on days 5–85', () => {
    const sim = makeSim({ seed: 'pins' });
    const spawns = sim.state.schedule.filter((e) => e.kind === 'pinSpawn');
    expect(spawns).toHaveLength(config.opportunities.perQuarter);
    for (const s of spawns) {
      expect(s.absDay).toBeGreaterThanOrEqual(5);
      expect(s.absDay).toBeLessThanOrEqual(85);
    }
  });

  it('expires after its lifetime when not collected', () => {
    const sim = makeSim({ seed: 'pins2' });
    sim.dispatch({ kind: 'pickPolicy', cardId: sim.state.draft!.hand[0] });
    sim.state.schedule = sim.state.schedule.filter((e) => e.kind === 'pinSpawn');
    const first = Math.min(...sim.state.schedule.map((e) => e.absDay));
    while (sim.absDay <= first) sim.tick();
    expect(sim.state.pins.length).toBeGreaterThan(0);
    const pin = sim.state.pins[0];
    expect(pin.expireAbsDay - pin.spawnAbsDay).toBe(config.opportunities.lifetimeDays);
    while (sim.absDay <= pin.expireAbsDay) sim.tick();
    expect(sim.state.pins.find((p) => p.id === pin.id)).toBeUndefined();
    expect(sim.state.log.some((l) => l.type === 'opportunity_expired' && l.pinId === pin.id)).toBe(true);
  });

  it('collecting applies the reward and removes the expiry', () => {
    const sim = makeSim({ seed: 'pins3' });
    sim.dispatch({ kind: 'pickPolicy', cardId: sim.state.draft!.hand[0] });
    const first = Math.min(...sim.state.schedule.filter((e) => e.kind === 'pinSpawn').map((e) => e.absDay));
    sim.state.resources.coalition = 100;
    while (sim.absDay <= first) sim.tick();
    const pin = sim.state.pins[0];
    const pc0 = sim.state.pc;
    expect(sim.dispatch({ kind: 'collectOpportunity', pinId: pin.id }).ok).toBe(true);
    const log = sim.state.log.find((l) => l.type === 'opportunity_collected')!;
    expect(log.region).toBe(pin.region);
    const opp = sim.data.opportunities.find((o) => o.id === pin.opportunityId)!;
    expect(sim.state.pc - pc0).toBe(opp.reward.pc ?? 0);
    expect(sim.state.schedule.some((e) => e.kind === 'pinExpire' && e.payload.pinId === pin.id)).toBe(false);
    expect(sim.dispatch({ kind: 'collectOpportunity', pinId: pin.id }).ok).toBe(false);
  });

  it('regions are chosen roughly by seat weight', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const sim = makeSim({ seed: `pw${i}` });
      for (const e of sim.state.schedule.filter((x) => x.kind === 'pinSpawn')) counts[e.payload.region] = (counts[e.payload.region] ?? 0) + 1;
    }
    expect(counts.CZ020).toBeGreaterThan(counts.CZ041 * 2);
  });
});

describe('budget vote', () => {
  it('opens on day 75 of Q1/5/9/13 only', () => {
    const sim = quietSim();
    const votes: number[] = [];
    sim.state.resources.coalition = 100;
    for (let guard = 0; guard < 5000 && !sim.isOver; guard++) {
      sim.state.resources.coalition = 100;
      for (const g of ['oligarchs', 'pensioners', 'media', 'eu', 'activists'] as const) sim.state.anger[g] = 30;
      if (sim.state.phase === 'budgetVote') {
        votes.push(sim.state.quarter);
        expect(sim.state.day).toBe(75);
        sim.dispatch(presetVote(sim, 'budget_balanced'));
      } else if (sim.state.phase === 'draft') sim.dispatch({ kind: 'pickPolicy', cardId: sim.state.draft!.hand[0] });
      else if (sim.state.phase === 'compromise') sim.dispatch({ kind: 'makeCompromise', cardId: sim.state.compromiseOffer![0], channelId: 'press', score: 0.5 });
      else sim.tick();
    }
    expect(votes).toEqual([1, 5, 9, 13]);
  });

  it('pass rate matches p_pass over many seeds', () => {
    let passed = 0;
    const N = 800;
    let p = 0;
    let stepMod = 0;
    for (let i = 0; i < N; i++) {
      const sim = quietSim({ seed: `bv${i}` });
      sim.state.day = 74;
      sim.state.resources.coalition = 40;
      while (sim.state.phase === 'running') sim.tick();
      sim.state.budgetVoteRedLines = [];
      p = passChance(sim, presetSliders(sim, 'budget_tight'), 'budget_tight');
      stepMod = sim.data.budgetItems.reduce((acc, it) => acc + it.passPerStep * presetSliders(sim, 'budget_tight')[it.id], 0);
      sim.dispatch(presetVote(sim, 'budget_tight'));
      if (sim.state.log.at(-1)!.passed) passed++;
    }
    expect(p).toBeCloseTo(0.75 + (sim0Coalition() - 50) / 100 - 0.1 + stepMod, 1);
    expect(Math.abs(passed / N - p)).toBeLessThan(0.05);
    function sim0Coalition() {
      return 40 + config.drift.coalition; // one day of drift before the vote opens
    }
  });

  it('a failed vote applies the provizorium penalties instead of the option', () => {
    const cfg = cfgWith((c) => {
      c.budgetVote.passMax = 0;
      c.budgetVote.passMin = 0;
    });
    const sim = quietSim({ seed: 'fail' }, cfg);
    sim.state.day = 74;
    while (sim.state.phase === 'running') sim.tick();
    const before = { ...sim.state.resources };
    const exp = sim.state.budget.expPct['313'];
    sim.dispatch(presetVote(sim, 'budget_generous'));
    const log = sim.state.log.find((l) => l.type === 'budget_vote')!;
    expect(log.passed).toBe(false);
    expect(sim.state.resources.coalition - before.coalition).toBeCloseTo(-8);
    expect(sim.state.resources.prestige - before.prestige).toBeCloseTo(-3);
    expect(sim.state.resources.support - before.support).toBeCloseTo(-2);
    expect(sim.state.budget.expPct['313']).toBe(exp); // option's budget changes not applied
  });

  it('a passed vote applies the preset sliders to the mapped chapters', () => {
    const cfg = cfgWith((c) => (c.budgetVote.passMin = 1));
    const sim = quietSim({ seed: 'pass' }, cfg);
    sim.state.day = 74;
    while (sim.state.phase === 'running') sim.tick();
    const exp = { ...sim.state.budget.expPct };
    sim.dispatch(presetVote(sim, 'budget_tight'));
    expect(sim.state.log.find((l) => l.type === 'budget_vote')!.passed).toBe(true);
    const want = { ...exp };
    const sl = presetSliders(sim, 'budget_tight');
    for (const it of sim.data.budgetItems)
      for (const c of it.chapters) want[c.chapter] += sl[it.id] * config.budgetVote.sliders.stepPct * c.weight;
    for (const code of Object.keys(exp)) expect(sim.state.budget.expPct[code]).toBeCloseTo(want[code]);
  });
});

describe('upgrades: Public Support branch', () => {
  it('enforces prerequisites and cost', () => {
    const sim = quietSim();
    sim.state.pc = 100;
    expect(sim.dispatch({ kind: 'buyUpgrade', nodeId: 'sup_press_office' }).ok).toBe(false);
    expect(sim.dispatch({ kind: 'buyUpgrade', nodeId: 'sup_campaign_office' }).ok).toBe(true);
    expect(sim.dispatch({ kind: 'buyUpgrade', nodeId: 'sup_campaign_office' }).ok).toBe(false);
    const tree = sim.data.upgrades[0];
    const status = (id: string) => nodeStatus(sim.state.ownedUpgrades, tree.nodes.find((n) => n.id === id)!);
    expect(status('sup_press_office')).toBe('available');
    expect(status('sup_permanent_campaign')).toBe('locked');
    sim.state.pc = 0;
    expect(sim.dispatch({ kind: 'buyUpgrade', nodeId: 'sup_press_office' }).ok).toBe(false);
  });

  it('each node changes the right numbers', () => {
    const sim = quietSim();
    sim.state.pc = 100;
    const buy = (id: string) => expect(sim.dispatch({ kind: 'buyUpgrade', nodeId: id }).ok).toBe(true);

    // Campaign Office: support drift x0.7
    buy('sup_campaign_office');
    sim.state.ongoing = [];
    const s0 = sim.state.resources.support;
    sim.tick();
    expect(sim.state.resources.support - s0).toBeCloseTo(config.drift.support * 0.7);

    // Press Office: media anger gains x0.75 (card preview)
    const mediaBefore = sim.previewCard('dummy_respondable').anger.media!;
    buy('sup_press_office');
    expect(sim.previewCard('dummy_respondable').anger.media!.max).toBeCloseTo(mediaBefore.max * 0.75);

    // Spin Doctors: support losses from chaos x0.7, policy losses unaffected
    const ev = sim.eventById.get('dummy_evt_1')!;
    const chaosBefore = sim.preview(ev, 'chaos').resources.support!;
    const polBefore = sim.preview(ev, 'policy').resources.support!;
    buy('sup_spin_doctors');
    expect(sim.preview(ev, 'chaos').resources.support!.min).toBeCloseTo(chaosBefore.min * 0.7);
    expect(sim.preview(ev, 'policy').resources.support!.min).toBeCloseTo(polBefore.min);

    // Pensioner Outreach: pensioner anger gains x0.75
    buy('sup_regional_tours');
    const penBefore = sim.previewCard('dummy_revenue').anger.pensioners!;
    buy('sup_pensioner_outreach');
    expect(sim.previewCard('dummy_revenue').anger.pensioners!.max).toBeCloseTo(penBefore.max * 0.75);

    // Permanent Campaign: election threshold -3
    const T0 = sim.computeProjection().T;
    buy('sup_permanent_campaign');
    expect(sim.computeProjection().T).toBeCloseTo(T0 - 3);
    expect(sim.state.log.filter((l) => l.type === 'upgrade_bought')).toHaveLength(6);
  });
});

describe('ongoing effects', () => {
  it('apply per day for their duration and refresh instead of stacking', () => {
    const sim = quietSim();
    sim.state.ongoing = [];
    const card = cardById('dummy_ongoing');
    sim.state.draft = { hand: [card.id], shownThisQuarter: [], rerolls: 0 };
    sim.state.phase = 'draft';
    sim.dispatch({ kind: 'pickPolicy', cardId: card.id });
    expect(sim.state.ongoing).toHaveLength(1);
    expect(sim.state.ongoing[0].daysLeft).toBe(120);
    advanceQuiet(sim, 10);
    expect(sim.state.ongoing[0].daysLeft).toBe(110);
    // same source again: refresh, not stack
    registerOngoing(sim.state, card.ongoing!, 'policy', `policy:${card.id}`);
    expect(sim.state.ongoing).toHaveLength(1);
    expect(sim.state.ongoing[0].daysLeft).toBe(120);
    // a different source stacks
    registerOngoing(sim.state, card.ongoing!, 'policy', 'policy:other');
    expect(sim.state.ongoing).toHaveLength(2);
  });
});
